import { query, getClient } from '../db/connection';
import { emitSectorEvent } from '../index';

/**
 * Combat Service for TradeWars 2030
 * 
 * Combat Mechanics (inspired by TradeWars 2002):
 * - Attacker initiates combat (costs 3 turns)
 * - Combat is resolved in rounds
 * - Each round: fighters attack, shields absorb damage
 * - Fighters deal 1 damage each, shields absorb 1 damage each
 * - Combat ends when one side has no fighters or retreats
 * - Winner can loot credits and cargo from loser
 * - If defender's fighters reach 0, ship is destroyed
 * - Destroyed players respawn in escape pod at Sol (sector 1)
 * 
 * TerraSpace Protection:
 * - Combat is DISABLED in TerraSpace (sectors 1-10)
 * - This provides a safe zone for new players
 */

export interface CombatResult {
  success: boolean;
  winner: 'attacker' | 'defender' | 'draw';
  rounds: number;
  attackerFightersLost: number;
  defenderFightersLost: number;
  attackerShieldsLost: number;
  defenderShieldsLost: number;
  defenderDestroyed: boolean;
  attackerDestroyed: boolean;
  creditsLooted: number;
  creditsLostByAttacker: number;
  cargoLooted: {
    fuel: number;
    organics: number;
    equipment: number;
  };
  cargoLostByAttacker: {
    fuel: number;
    organics: number;
    equipment: number;
  };
  colonistsLostAttacker: number;
  colonistsLostDefender: number;
  attackerEscapeSector: number | null;
  defenderEscapeSector: number | null;
  message: string;
  combatLog: CombatRound[];
}

export interface CombatRound {
  round: number;
  attackerFighters: number;
  defenderFighters: number;
  attackerShields: number;
  defenderShields: number;
  attackerDamageDealt: number;
  defenderDamageDealt: number;
  description: string;
}

interface PlayerCombatStats {
  id: number;
  user_id: number;
  universe_id: number;
  corp_name: string;
  username: string;
  current_sector: number;
  credits: number;
  ship_type: string;
  ship_fighters: number;
  ship_shields: number;
  ship_holds_max: number;
  cargo_fuel: number;
  cargo_organics: number;
  cargo_equipment: number;
  colonists: number;
  is_alive: boolean;
  alignment: number;
  kills: number;
  deaths: number;
}

const COMBAT_TURN_COST = 3;
const TERRASPACE_MAX_SECTOR = 10;
const LOOT_PERCENTAGE = 0.5; // 50% of victim's credits/cargo

/**
 * Check if a player can attack another player
 */
export const canAttack = async (
  attackerId: number,
  defenderId: number
): Promise<{ canAttack: boolean; reason?: string }> => {
  // Get both players' data
  const result = await query(
    `SELECT 
      p.id, p.universe_id, p.current_sector, p.ship_fighters, 
      p.turns_remaining, p.is_alive, p.in_escape_pod,
      s.region
     FROM players p
     JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
     WHERE p.id IN ($1, $2)`,
    [attackerId, defenderId]
  );

  if (result.rows.length < 2) {
    return { canAttack: false, reason: 'One or both players not found' };
  }

  const attacker = result.rows.find((r: any) => r.id === attackerId);
  const defender = result.rows.find((r: any) => r.id === defenderId);

  // Check if attacker is alive
  if (!attacker.is_alive) {
    return { canAttack: false, reason: 'You are not alive' };
  }

  // Check if attacker is in escape pod
  if (attacker.in_escape_pod) {
    return { canAttack: false, reason: 'Cannot attack while in an escape pod' };
  }

  // Check if defender is alive
  if (!defender.is_alive) {
    return { canAttack: false, reason: 'Target is not alive' };
  }

  // Check if in same universe
  if (attacker.universe_id !== defender.universe_id) {
    return { canAttack: false, reason: 'Players are in different universes' };
  }

  // Check if in same sector
  if (attacker.current_sector !== defender.current_sector) {
    return { canAttack: false, reason: 'Target is not in your sector' };
  }

  // Check TerraSpace protection
  if (attacker.region === 'TerraSpace') {
    return { canAttack: false, reason: 'Combat is disabled in TerraSpace (safe zone)' };
  }

  // Check if attacker has fighters
  if (attacker.ship_fighters <= 0) {
    return { canAttack: false, reason: 'You have no fighters to attack with' };
  }

  // Check if attacker has enough turns
  if (attacker.turns_remaining < COMBAT_TURN_COST) {
    return { canAttack: false, reason: `Combat requires ${COMBAT_TURN_COST} turns` };
  }

  // Cannot attack yourself
  if (attackerId === defenderId) {
    return { canAttack: false, reason: 'Cannot attack yourself' };
  }

  return { canAttack: true };
};

/**
 * Execute combat between two players
 */
export const executeAttack = async (
  attackerId: number,
  defenderId: number
): Promise<CombatResult> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get attacker and defender stats with FOR UPDATE lock
    const attackerResult = await client.query(
      `SELECT 
        p.id, p.user_id, p.universe_id, p.corp_name, p.current_sector,
        p.credits, p.ship_type, p.ship_fighters, p.ship_shields, p.ship_holds_max,
        p.cargo_fuel, p.cargo_organics, p.cargo_equipment, p.colonists, p.is_alive,
        p.alignment, p.kills, p.deaths, u.username
       FROM players p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1
       FOR UPDATE OF p`,
      [attackerId]
    );

    const defenderResult = await client.query(
      `SELECT 
        p.id, p.user_id, p.universe_id, p.corp_name, p.current_sector,
        p.credits, p.ship_type, p.ship_fighters, p.ship_shields, p.ship_holds_max,
        p.cargo_fuel, p.cargo_organics, p.cargo_equipment, p.colonists, p.is_alive,
        p.alignment, p.kills, p.deaths, u.username
       FROM players p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1
       FOR UPDATE OF p`,
      [defenderId]
    );

    if (attackerResult.rows.length === 0 || defenderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error('Player not found');
    }

    const attacker: PlayerCombatStats = {
      ...attackerResult.rows[0],
      colonists: attackerResult.rows[0].colonists || 0
    };
    const defender: PlayerCombatStats = {
      ...defenderResult.rows[0],
      colonists: defenderResult.rows[0].colonists || 0
    };

    // Get sectors 1-3 jumps away for escape pod destinations
    const getEscapeSectorFn = async (): Promise<number> => {
      const startSector = attacker.current_sector;
      const jumps = Math.floor(Math.random() * 3) + 1; // 1-3 jumps
      
      // Use BFS to find sectors at specific jump distance
      const visited = new Set<number>();
      const queue: Array<{ sector: number; distance: number }> = [{ sector: startSector, distance: 0 }];
      const candidates: number[] = [];
      
      while (queue.length > 0) {
        const { sector, distance } = queue.shift()!;
        
        if (visited.has(sector)) continue;
        visited.add(sector);
        
        if (distance === jumps && sector !== startSector) {
          candidates.push(sector);
        }
        
        if (distance < jumps) {
          // Get adjacent sectors
          const sectorResult = await client.query(
            `SELECT s.id FROM sectors s 
             WHERE s.universe_id = $1 AND s.sector_number = $2`,
            [attacker.universe_id, sector]
          );
          
          if (sectorResult.rows.length > 0) {
            const sectorId = sectorResult.rows[0].id;
            const adjacentResult = await client.query(
              `SELECT DISTINCT destination_sector_number as sector
               FROM sector_warps 
               WHERE sector_id = $1
               UNION
               SELECT s.sector_number as sector
               FROM sector_warps sw
               JOIN sectors s ON sw.sector_id = s.id
               WHERE sw.destination_sector_number = $2 AND s.universe_id = $3`,
              [sectorId, sector, attacker.universe_id]
            );
            
            for (const row of adjacentResult.rows) {
              if (!visited.has(row.sector)) {
                queue.push({ sector: row.sector, distance: distance + 1 });
              }
            }
          }
        }
      }
      
      // Pick random candidate, or fallback to adjacent, or sector 1
      if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
      
      // Fallback: try adjacent sectors
      const sectorResult = await client.query(
        `SELECT s.id FROM sectors s 
         WHERE s.universe_id = $1 AND s.sector_number = $2`,
        [attacker.universe_id, startSector]
      );
      
      if (sectorResult.rows.length > 0) {
        const sectorId = sectorResult.rows[0].id;
        const adjacentResult = await client.query(
          `SELECT DISTINCT destination_sector_number as sector
           FROM sector_warps 
           WHERE sector_id = $1
           UNION
           SELECT s.sector_number as sector
           FROM sector_warps sw
           JOIN sectors s ON sw.sector_id = s.id
           WHERE sw.destination_sector_number = $2 AND s.universe_id = $3`,
          [sectorId, startSector, attacker.universe_id]
        );
        
        const adjacentSectors = adjacentResult.rows.map(r => r.sector);
        if (adjacentSectors.length > 0) {
          return adjacentSectors[Math.floor(Math.random() * adjacentSectors.length)];
        }
      }
      
      return 1; // Final fallback to Sol
    };

    // Run combat simulation with async escape sector function
    const combatResult = await simulateCombatAsync(attacker, defender, getEscapeSectorFn);

    // Deduct turns from attacker
    await client.query(
      'UPDATE players SET turns_remaining = turns_remaining - $1, last_combat_at = NOW() WHERE id = $2',
      [COMBAT_TURN_COST, attackerId]
    );

    // Update defender's last combat time
    await client.query(
      'UPDATE players SET last_combat_at = NOW() WHERE id = $1',
      [defenderId]
    );

    // Apply fighter/shield losses to attacker
    await client.query(
      `UPDATE players SET 
        ship_fighters = ship_fighters - $1,
        ship_shields = ship_shields - $2
       WHERE id = $3`,
      [combatResult.attackerFightersLost, combatResult.attackerShieldsLost, attackerId]
    );

    // Apply fighter/shield losses to defender
    await client.query(
      `UPDATE players SET 
        ship_fighters = ship_fighters - $1,
        ship_shields = ship_shields - $2
       WHERE id = $3`,
      [combatResult.defenderFightersLost, combatResult.defenderShieldsLost, defenderId]
    );

    // Handle loot and destruction
    if (combatResult.defenderDestroyed && !combatResult.attackerDestroyed) {
      // Attacker wins - Calculate how much cargo they can hold
      const attackerCurrentCargo = attacker.cargo_fuel + attacker.cargo_organics + attacker.cargo_equipment;
      const attackerFreeSpace = attacker.ship_holds_max - attackerCurrentCargo;
      
      // Distribute loot - prioritize equipment > organics > fuel (by value)
      let fuelTaken = 0, organicsTaken = 0, equipmentTaken = 0;
      let remainingSpace = attackerFreeSpace;
      
      // Take equipment first (highest value)
      equipmentTaken = Math.min(combatResult.cargoLooted.equipment, remainingSpace);
      remainingSpace -= equipmentTaken;
      
      // Then organics
      organicsTaken = Math.min(combatResult.cargoLooted.organics, remainingSpace);
      remainingSpace -= organicsTaken;
      
      // Then fuel
      fuelTaken = Math.min(combatResult.cargoLooted.fuel, remainingSpace);
      
      // Calculate floating cargo (what couldn't be picked up)
      const floatingFuel = combatResult.cargoLooted.fuel - fuelTaken;
      const floatingOrganics = combatResult.cargoLooted.organics - organicsTaken;
      const floatingEquipment = combatResult.cargoLooted.equipment - equipmentTaken;
      
      // Transfer cargo to attacker
      await client.query(
        `UPDATE players SET 
          credits = credits + $1,
          cargo_fuel = cargo_fuel + $2,
          cargo_organics = cargo_organics + $3,
          cargo_equipment = cargo_equipment + $4,
          kills = kills + 1,
          alignment = alignment - 100
         WHERE id = $5`,
        [combatResult.creditsLooted, fuelTaken, organicsTaken, equipmentTaken, attackerId]
      );

      // Create floating cargo if any couldn't be held
      if (floatingFuel > 0 || floatingOrganics > 0 || floatingEquipment > 0 || combatResult.colonistsLostDefender > 0) {
        await client.query(
          `INSERT INTO sector_cargo (universe_id, sector_number, fuel, organics, equipment, colonists, source_event, source_player_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'combat', $7)`,
          [attacker.universe_id, attacker.current_sector, floatingFuel, floatingOrganics, floatingEquipment, 0, defenderId]
        );
      }

      // Handle defender death - escape pod warps to adjacent sector
      await client.query(
        `UPDATE players SET 
          ship_type = 'Escape Pod',
          ship_fighters = 0,
          ship_shields = 0,
          ship_holds_max = 5,
          cargo_fuel = 0,
          cargo_organics = 0,
          cargo_equipment = 0,
          colonists = 0,
          credits = GREATEST(0, credits - $1),
          current_sector = $2,
          in_escape_pod = TRUE,
          deaths = deaths + 1
         WHERE id = $3`,
        [combatResult.creditsLooted, combatResult.defenderEscapeSector, defenderId]
      );
    }

    if (combatResult.attackerDestroyed && !combatResult.defenderDestroyed) {
      // Defender wins - Calculate how much cargo they can hold
      const defenderCurrentCargo = defender.cargo_fuel + defender.cargo_organics + defender.cargo_equipment;
      const defenderFreeSpace = defender.ship_holds_max - defenderCurrentCargo;
      
      // Distribute loot - prioritize equipment > organics > fuel (by value)
      let fuelTaken = 0, organicsTaken = 0, equipmentTaken = 0;
      let remainingSpace = defenderFreeSpace;
      
      equipmentTaken = Math.min(combatResult.cargoLostByAttacker.equipment, remainingSpace);
      remainingSpace -= equipmentTaken;
      
      organicsTaken = Math.min(combatResult.cargoLostByAttacker.organics, remainingSpace);
      remainingSpace -= organicsTaken;
      
      fuelTaken = Math.min(combatResult.cargoLostByAttacker.fuel, remainingSpace);
      
      // Calculate floating cargo
      const floatingFuel = combatResult.cargoLostByAttacker.fuel - fuelTaken;
      const floatingOrganics = combatResult.cargoLostByAttacker.organics - organicsTaken;
      const floatingEquipment = combatResult.cargoLostByAttacker.equipment - equipmentTaken;
      
      // Transfer cargo to defender
      await client.query(
        `UPDATE players SET 
          credits = credits + $1,
          cargo_fuel = cargo_fuel + $2,
          cargo_organics = cargo_organics + $3,
          cargo_equipment = cargo_equipment + $4,
          kills = kills + 1
         WHERE id = $5`,
        [combatResult.creditsLostByAttacker, fuelTaken, organicsTaken, equipmentTaken, defenderId]
      );

      // Create floating cargo if any couldn't be held
      if (floatingFuel > 0 || floatingOrganics > 0 || floatingEquipment > 0 || combatResult.colonistsLostAttacker > 0) {
        await client.query(
          `INSERT INTO sector_cargo (universe_id, sector_number, fuel, organics, equipment, colonists, source_event, source_player_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'combat', $7)`,
          [attacker.universe_id, attacker.current_sector, floatingFuel, floatingOrganics, floatingEquipment, 0, attackerId]
        );
      }

      // Handle attacker death - escape pod warps to adjacent sector
      await client.query(
        `UPDATE players SET 
          ship_type = 'Escape Pod',
          ship_fighters = 0,
          ship_shields = 0,
          ship_holds_max = 5,
          cargo_fuel = 0,
          cargo_organics = 0,
          cargo_equipment = 0,
          colonists = 0,
          credits = GREATEST(0, credits - $1),
          current_sector = $2,
          in_escape_pod = TRUE,
          deaths = deaths + 1
         WHERE id = $3`,
        [combatResult.creditsLostByAttacker, combatResult.attackerEscapeSector, attackerId]
      );
    }

    if (combatResult.attackerDestroyed && combatResult.defenderDestroyed) {
      // Mutual destruction - ALL cargo floats in space, no one gets anything
      const totalFloatingFuel = attacker.cargo_fuel + defender.cargo_fuel;
      const totalFloatingOrganics = attacker.cargo_organics + defender.cargo_organics;
      const totalFloatingEquipment = attacker.cargo_equipment + defender.cargo_equipment;
      
      if (totalFloatingFuel > 0 || totalFloatingOrganics > 0 || totalFloatingEquipment > 0) {
        await client.query(
          `INSERT INTO sector_cargo (universe_id, sector_number, fuel, organics, equipment, colonists, source_event)
           VALUES ($1, $2, $3, $4, $5, 0, 'combat')`,
          [attacker.universe_id, attacker.current_sector, totalFloatingFuel, totalFloatingOrganics, totalFloatingEquipment]
        );
      }

      // Both die
      await client.query(
        `UPDATE players SET 
          ship_type = 'Escape Pod',
          ship_fighters = 0,
          ship_shields = 0,
          ship_holds_max = 5,
          cargo_fuel = 0,
          cargo_organics = 0,
          cargo_equipment = 0,
          colonists = 0,
          credits = GREATEST(0, credits * 0.5),
          current_sector = $1,
          in_escape_pod = TRUE,
          deaths = deaths + 1
         WHERE id = $2`,
        [combatResult.attackerEscapeSector, attackerId]
      );

      await client.query(
        `UPDATE players SET 
          ship_type = 'Escape Pod',
          ship_fighters = 0,
          ship_shields = 0,
          ship_holds_max = 5,
          cargo_fuel = 0,
          cargo_organics = 0,
          cargo_equipment = 0,
          colonists = 0,
          credits = GREATEST(0, credits * 0.5),
          current_sector = $1,
          in_escape_pod = TRUE,
          deaths = deaths + 1
         WHERE id = $2`,
        [combatResult.defenderEscapeSector, defenderId]
      );
    }

    // Log combat to combat_log
    await client.query(
      `INSERT INTO combat_log (
        universe_id, attacker_id, defender_id, sector_number,
        attacker_ship, defender_ship, winner_id,
        credits_looted, cargo_looted, combat_details,
        rounds_fought, attacker_fighters_lost, defender_fighters_lost,
        attacker_shields_lost, defender_shields_lost, defender_destroyed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        attacker.universe_id,
        attackerId,
        defenderId,
        attacker.current_sector,
        attacker.ship_type,
        defender.ship_type,
        combatResult.winner === 'attacker' ? attackerId : 
          combatResult.winner === 'defender' ? defenderId : null,
        combatResult.creditsLooted,
        JSON.stringify(combatResult.cargoLooted),
        JSON.stringify(combatResult.combatLog),
        combatResult.rounds,
        combatResult.attackerFightersLost,
        combatResult.defenderFightersLost,
        combatResult.attackerShieldsLost,
        combatResult.defenderShieldsLost,
        combatResult.defenderDestroyed
      ]
    );

    // Log game event
    await client.query(
      `INSERT INTO game_events (universe_id, player_id, event_type, event_data, sector_number)
       VALUES ($1, $2, 'combat', $3, $4)`,
      [
        attacker.universe_id,
        attackerId,
        JSON.stringify({
          attacker: attacker.corp_name,
          defender: defender.corp_name,
          winner: combatResult.winner,
          defenderDestroyed: combatResult.defenderDestroyed,
          creditsLooted: combatResult.creditsLooted
        }),
        attacker.current_sector
      ]
    );

    await client.query('COMMIT');

    // Emit WebSocket event to all players in sector about the combat
    emitSectorEvent(attacker.universe_id, attacker.current_sector, 'combat_occurred', {
      attackerName: `${attacker.username} (${attacker.corp_name})`,
      attackerShip: attacker.ship_type,
      defenderName: `${defender.username} (${defender.corp_name})`,
      defenderShip: defender.ship_type,
      winner: combatResult.winner,
      attackerDestroyed: combatResult.attackerDestroyed,
      defenderDestroyed: combatResult.defenderDestroyed,
      attackerEscapeSector: combatResult.attackerEscapeSector,
      defenderEscapeSector: combatResult.defenderEscapeSector,
      timestamp: new Date().toISOString()
    });

    // If someone was destroyed, notify them of their escape pod location
    if (combatResult.defenderDestroyed && combatResult.defenderEscapeSector) {
      emitSectorEvent(attacker.universe_id, combatResult.defenderEscapeSector, 'escape_pod_arrived', {
        playerName: defender.username,
        playerCorp: defender.corp_name,
        fromSector: attacker.current_sector,
        timestamp: new Date().toISOString()
      });
    }
    if (combatResult.attackerDestroyed && combatResult.attackerEscapeSector) {
      emitSectorEvent(attacker.universe_id, combatResult.attackerEscapeSector, 'escape_pod_arrived', {
        playerName: attacker.username,
        playerCorp: attacker.corp_name,
        fromSector: attacker.current_sector,
        timestamp: new Date().toISOString()
      });
    }

    return combatResult;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Simulate combat between attacker and defender (async version)
 * Returns detailed combat results
 */
async function simulateCombatAsync(
  attacker: PlayerCombatStats,
  defender: PlayerCombatStats,
  getEscapeSector: () => Promise<number>
): Promise<CombatResult> {
  let attackerFighters = attacker.ship_fighters;
  let defenderFighters = defender.ship_fighters;
  let attackerShields = attacker.ship_shields;
  let defenderShields = defender.ship_shields;

  const initialAttackerFighters = attackerFighters;
  const initialDefenderFighters = defenderFighters;
  const initialAttackerShields = attackerShields;
  const initialDefenderShields = defenderShields;

  const combatLog: CombatRound[] = [];
  let round = 0;
  const maxRounds = 10; // Prevent infinite combat

  // Combat loop - continue until one side has no fighters or max rounds
  while (attackerFighters > 0 && defenderFighters > 0 && round < maxRounds) {
    round++;

    // Calculate damage for this round with significant randomness
    // Base damage = fighter count, but with luck factor (50-150%)
    // Plus critical hit chance (10% chance for 2x damage)
    // Plus dodge chance (15% chance to reduce incoming damage by 50%)
    
    const attackerLuckFactor = 0.5 + Math.random(); // 0.5 to 1.5
    const defenderLuckFactor = 0.5 + Math.random(); // 0.5 to 1.5
    
    const attackerCritical = Math.random() < 0.10; // 10% crit chance
    const defenderCritical = Math.random() < 0.10;
    
    const attackerDodge = Math.random() < 0.15; // 15% dodge chance
    const defenderDodge = Math.random() < 0.15;
    
    let attackerBaseDamage = Math.floor(attackerFighters * attackerLuckFactor);
    let defenderBaseDamage = Math.floor(defenderFighters * defenderLuckFactor);
    
    // Apply critical hits (2x damage)
    if (attackerCritical) attackerBaseDamage *= 2;
    if (defenderCritical) defenderBaseDamage *= 2;
    
    // Apply dodges (50% damage reduction)
    const attackerDamage = defenderDodge ? Math.floor(attackerBaseDamage * 0.5) : attackerBaseDamage;
    const defenderDamage = attackerDodge ? Math.floor(defenderBaseDamage * 0.5) : defenderBaseDamage;

    // Apply damage - shields absorb first, then fighters take damage
    // Shields absorb 2 damage each (they're stronger than fighters)
    let damageToDefender = attackerDamage;
    let shieldAbsorb = Math.min(defenderShields * 2, damageToDefender);
    let shieldsLostDefender = Math.ceil(shieldAbsorb / 2);
    defenderShields -= shieldsLostDefender;
    damageToDefender -= shieldAbsorb;
    let fightersLostDefender = Math.min(defenderFighters, damageToDefender);
    defenderFighters -= fightersLostDefender;

    let damageToAttacker = defenderDamage;
    let attackerShieldAbsorb = Math.min(attackerShields * 2, damageToAttacker);
    let shieldsLostAttacker = Math.ceil(attackerShieldAbsorb / 2);
    attackerShields -= shieldsLostAttacker;
    damageToAttacker -= attackerShieldAbsorb;
    let fightersLostAttacker = Math.min(attackerFighters, damageToAttacker);
    attackerFighters -= fightersLostAttacker;

    // Build description with combat events
    let desc = `Round ${round}: `;
    if (attackerCritical) desc += '⚡CRITICAL! ';
    if (defenderDodge) desc += '(Defender dodged!) ';
    desc += `Attacker deals ${attackerDamage} dmg. `;
    if (defenderCritical) desc += '⚡CRITICAL! ';
    if (attackerDodge) desc += '(Attacker dodged!) ';
    desc += `Defender deals ${defenderDamage} dmg.`;

    // Log this round
    combatLog.push({
      round,
      attackerFighters,
      defenderFighters,
      attackerShields,
      defenderShields,
      attackerDamageDealt: attackerDamage,
      defenderDamageDealt: defenderDamage,
      description: desc
    });
  }

  // Determine winner
  let winner: 'attacker' | 'defender' | 'draw';
  let defenderDestroyed = false;
  let attackerDestroyed = false;

  if (defenderFighters <= 0 && attackerFighters > 0) {
    winner = 'attacker';
    defenderDestroyed = true;
  } else if (attackerFighters <= 0 && defenderFighters > 0) {
    winner = 'defender';
    attackerDestroyed = true;
  } else if (attackerFighters <= 0 && defenderFighters <= 0) {
    winner = 'draw';
    // Both destroyed in mutual destruction!
    defenderDestroyed = true;
    attackerDestroyed = true;
  } else {
    // Max rounds reached - whoever has more fighters wins
    winner = attackerFighters > defenderFighters ? 'attacker' : 
             defenderFighters > attackerFighters ? 'defender' : 'draw';
  }

  // Calculate loot (only if defender destroyed)
  let creditsLooted = 0;
  let cargoLooted = { fuel: 0, organics: 0, equipment: 0 };

  if (defenderDestroyed) {
    creditsLooted = Math.floor(defender.credits * LOOT_PERCENTAGE);
    cargoLooted = {
      fuel: Math.floor(defender.cargo_fuel * LOOT_PERCENTAGE),
      organics: Math.floor(defender.cargo_organics * LOOT_PERCENTAGE),
      equipment: Math.floor(defender.cargo_equipment * LOOT_PERCENTAGE)
    };
  }

  // Calculate attacker losses (if attacker destroyed)
  let creditsLostByAttacker = 0;
  let cargoLostByAttacker = { fuel: 0, organics: 0, equipment: 0 };

  if (attackerDestroyed) {
    creditsLostByAttacker = Math.floor(attacker.credits * LOOT_PERCENTAGE);
    cargoLostByAttacker = {
      fuel: attacker.cargo_fuel, // All cargo lost
      organics: attacker.cargo_organics,
      equipment: attacker.cargo_equipment
    };
  }

  // Colonists die when ship is destroyed (they freeze in space)
  const colonistsLostAttacker = attackerDestroyed ? attacker.colonists : 0;
  const colonistsLostDefender = defenderDestroyed ? defender.colonists : 0;

  // Determine escape sectors (async)
  const attackerEscapeSector = attackerDestroyed ? await getEscapeSector() : null;
  const defenderEscapeSector = defenderDestroyed ? await getEscapeSector() : null;

  // Generate result message with username format
  const attackerDisplay = `${attacker.username} (${attacker.corp_name})`;
  const defenderDisplay = `${defender.username} (${defender.corp_name})`;
  
  let message = '';
  if (attackerDestroyed && defenderDestroyed) {
    message = `MUTUAL DESTRUCTION! Both ships destroyed in the firefight!`;
  } else if (defenderDestroyed) {
    message = `Victory! ${defenderDisplay}'s ${defender.ship_type} was destroyed! ` +
              `Looted ${creditsLooted.toLocaleString()} credits and cargo.`;
    if (colonistsLostDefender > 0) {
      message += ` ${colonistsLostDefender} colonists froze to death in space.`;
    }
  } else if (attackerDestroyed) {
    message = `DESTROYED! ${defenderDisplay} overwhelmed your ship! ` +
              `Your escape pod warps ${attackerEscapeSector ? `${Math.abs(attackerEscapeSector - attacker.current_sector)} jump(s) away to sector ${attackerEscapeSector}` : 'to safety'}...`;
    if (colonistsLostAttacker > 0) {
      message += ` ${colonistsLostAttacker} colonists froze to death in space.`;
    }
  } else if (winner === 'defender') {
    message = `Defeat! Your attack on ${defenderDisplay} failed. Retreat!`;
  } else {
    message = `Draw! Combat ended inconclusively after ${round} rounds.`;
  }

  return {
    success: true,
    winner,
    rounds: round,
    attackerFightersLost: initialAttackerFighters - attackerFighters,
    defenderFightersLost: initialDefenderFighters - defenderFighters,
    attackerShieldsLost: initialAttackerShields - attackerShields,
    defenderShieldsLost: initialDefenderShields - defenderShields,
    defenderDestroyed,
    attackerDestroyed,
    creditsLooted,
    creditsLostByAttacker,
    cargoLooted,
    cargoLostByAttacker,
    colonistsLostAttacker,
    colonistsLostDefender,
    attackerEscapeSector,
    defenderEscapeSector,
    message,
    combatLog
  };
}

/**
 * Get combat history for a player
 */
export const getCombatHistory = async (
  playerId: number,
  limit: number = 20
): Promise<any[]> => {
  const result = await query(
    `SELECT 
      cl.*,
      att.corp_name as attacker_name,
      def.corp_name as defender_name,
      att_user.username as attacker_username,
      def_user.username as defender_username
     FROM combat_log cl
     LEFT JOIN players att ON cl.attacker_id = att.id
     LEFT JOIN players def ON cl.defender_id = def.id
     LEFT JOIN users att_user ON att.user_id = att_user.id
     LEFT JOIN users def_user ON def.user_id = def_user.id
     WHERE cl.attacker_id = $1 OR cl.defender_id = $1
     ORDER BY cl.created_at DESC
     LIMIT $2`,
    [playerId, limit]
  );

  return result.rows;
};

/**
 * Get players in sector that can be attacked
 */
export const getAttackableTargets = async (
  playerId: number
): Promise<any[]> => {
  const result = await query(
    `SELECT 
      p.id, p.corp_name, p.ship_type, p.ship_fighters, p.ship_shields,
      p.alignment, u.username,
      s.region
     FROM players p
     JOIN users u ON p.user_id = u.id
     JOIN players attacker ON attacker.id = $1
     JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
     WHERE p.universe_id = attacker.universe_id
       AND p.current_sector = attacker.current_sector
       AND p.id != $1
       AND p.is_alive = TRUE
       AND p.in_escape_pod = FALSE`,
    [playerId]
  );

  return result.rows.map(p => ({
    id: p.id,
    corpName: p.corp_name,
    username: p.username,
    shipType: p.ship_type,
    fighters: p.ship_fighters,
    shields: p.ship_shields,
    alignment: p.alignment,
    inSafeZone: p.region === 'TerraSpace'
  }));
};

/**
 * Clear escape pod status when player upgrades ship
 */
export const clearEscapePodStatus = async (playerId: number): Promise<void> => {
  await query(
    'UPDATE players SET in_escape_pod = FALSE WHERE id = $1',
    [playerId]
  );
};

