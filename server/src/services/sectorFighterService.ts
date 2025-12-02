import { query, getClient } from '../db/connection';
import { emitSectorEvent } from '../index';

const MAX_FIGHTERS_PER_SECTOR = 500;
const MAX_FIGHTERS_PER_SECTOR_WITH_PLANET = 1500; // Increased limit if corp owns planet
const MAINTENANCE_COST_PER_FIGHTER_PER_DAY = 5; // ₡5 per fighter per day

export interface DeployedFighters {
  id: number;
  ownerId: number;
  ownerName: string;
  fighterCount: number;
  deployedAt: string;
}

/**
 * Get deployed fighters in a sector
 */
export const getSectorFighters = async (
  universeId: number,
  sectorNumber: number
): Promise<DeployedFighters[]> => {
  const result = await query(
    `SELECT id, owner_id, owner_name, fighter_count, deployed_at
     FROM sector_fighters
     WHERE universe_id = $1 AND sector_number = $2 AND fighter_count > 0
     ORDER BY fighter_count DESC`,
    [universeId, sectorNumber]
  );
  
  return result.rows.map(r => ({
    id: r.id,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    fighterCount: r.fighter_count,
    deployedAt: r.deployed_at
  }));
};

/**
 * Get total fighters a player has deployed across all sectors
 */
export const getPlayerTotalDeployed = async (playerId: number): Promise<number> => {
  const result = await query(
    `SELECT COALESCE(SUM(fighter_count), 0) as total
     FROM sector_fighters WHERE owner_id = $1`,
    [playerId]
  );
  return parseInt(result.rows[0].total);
};

/**
 * Deploy fighters to the current sector
 */
export const deployFighters = async (
  playerId: number,
  count: number
): Promise<{ success: boolean; message: string; newShipFighters?: number; deployedInSector?: number }> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    if (count <= 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Must deploy at least 1 fighter' };
    }

    // Get player data
    const playerResult = await client.query(
      `SELECT id, universe_id, current_sector, ship_fighters, corp_name
       FROM players WHERE id = $1 FOR UPDATE`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found' };
    }

    const player = playerResult.rows[0];

    // Check player has enough fighters
    if (player.ship_fighters < count) {
      await client.query('ROLLBACK');
      return { success: false, message: `You only have ${player.ship_fighters} fighters on your ship` };
    }

    // Check sector region (no deploying in TerraSpace)
    const sectorResult = await client.query(
      `SELECT s.region, s.id as sector_id
       FROM sectors s
       WHERE s.universe_id = $1 AND s.sector_number = $2`,
      [player.universe_id, player.current_sector]
    );

    if (sectorResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Sector not found' };
    }

    if (sectorResult.rows[0].region === 'TerraSpace') {
      await client.query('ROLLBACK');
      return { success: false, message: 'Cannot deploy fighters in TerraSpace (safe zone)' };
    }

    // Check if player's corp owns a planet in this sector
    const planetResult = await client.query(
      `SELECT 1 FROM planets p
       JOIN players pl ON p.owner_id = pl.id
       WHERE p.sector_id = $1 AND pl.corp_name = $2`,
      [sectorResult.rows[0].sector_id, player.corp_name]
    );

    const hasPlanet = planetResult.rows.length > 0;
    const maxFighters = hasPlanet ? MAX_FIGHTERS_PER_SECTOR_WITH_PLANET : MAX_FIGHTERS_PER_SECTOR;

    // Check current deployment in this sector
    const existingResult = await client.query(
      `SELECT id, fighter_count FROM sector_fighters
       WHERE universe_id = $1 AND sector_number = $2 AND owner_id = $3`,
      [player.universe_id, player.current_sector, playerId]
    );

    let currentInSector = 0;
    if (existingResult.rows.length > 0) {
      currentInSector = existingResult.rows[0].fighter_count;
    }

    // Check max per sector
    if (currentInSector + count > maxFighters) {
      await client.query('ROLLBACK');
      return { success: false, message: `Maximum ${maxFighters} fighters per sector${hasPlanet ? ' (planet bonus)' : ''}. You have ${currentInSector} here.` };
    }

    // Remove fighters from ship
    await client.query(
      `UPDATE players SET ship_fighters = ship_fighters - $1 WHERE id = $2`,
      [count, playerId]
    );

    // Add to sector (upsert)
    if (existingResult.rows.length > 0) {
      await client.query(
        `UPDATE sector_fighters SET fighter_count = fighter_count + $1, last_maintenance = CURRENT_TIMESTAMP WHERE id = $2`,
        [count, existingResult.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO sector_fighters (universe_id, sector_number, owner_id, owner_name, fighter_count, last_maintenance)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [player.universe_id, player.current_sector, playerId, player.corp_name, count]
      );
    }

    await client.query('COMMIT');

    // Emit event to sector
    emitSectorEvent(player.universe_id, player.current_sector, 'fighters_deployed', {
      ownerName: player.corp_name,
      count,
      totalInSector: currentInSector + count
    });

    return {
      success: true,
      message: `Deployed ${count} fighters in Sector ${player.current_sector}`,
      newShipFighters: player.ship_fighters - count,
      deployedInSector: currentInSector + count
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Retrieve fighters from the current sector
 */
export const retrieveFighters = async (
  playerId: number,
  count: number
): Promise<{ success: boolean; message: string; newShipFighters?: number; remainingInSector?: number }> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    if (count <= 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Must retrieve at least 1 fighter' };
    }

    // Get player data
    const playerResult = await client.query(
      `SELECT p.id, p.universe_id, p.current_sector, p.ship_fighters,
              st.fighters_max
       FROM players p
       JOIN ship_types st ON LOWER(st.name) = LOWER(p.ship_type) AND (st.universe_id = p.universe_id OR st.universe_id IS NULL)
       WHERE p.id = $1`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found' };
    }

    const player = playerResult.rows[0];

    // Check ship capacity
    const spaceAvailable = player.fighters_max - player.ship_fighters;
    if (count > spaceAvailable) {
      await client.query('ROLLBACK');
      return { success: false, message: `Your ship can only hold ${spaceAvailable} more fighters` };
    }

    // Get deployed fighters
    const deployedResult = await client.query(
      `SELECT id, fighter_count FROM sector_fighters
       WHERE universe_id = $1 AND sector_number = $2 AND owner_id = $3 FOR UPDATE`,
      [player.universe_id, player.current_sector, playerId]
    );

    if (deployedResult.rows.length === 0 || deployedResult.rows[0].fighter_count === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'You have no fighters deployed here' };
    }

    const deployed = deployedResult.rows[0];
    if (count > deployed.fighter_count) {
      await client.query('ROLLBACK');
      return { success: false, message: `You only have ${deployed.fighter_count} fighters deployed here` };
    }

    // Add to ship
    await client.query(
      `UPDATE players SET ship_fighters = ship_fighters + $1 WHERE id = $2`,
      [count, playerId]
    );

    // Remove from sector
    const remaining = deployed.fighter_count - count;
    if (remaining <= 0) {
      await client.query(`DELETE FROM sector_fighters WHERE id = $1`, [deployed.id]);
    } else {
      await client.query(
        `UPDATE sector_fighters SET fighter_count = $1 WHERE id = $2`,
        [remaining, deployed.id]
      );
    }

    await client.query('COMMIT');

    return {
      success: true,
      message: `Retrieved ${count} fighters`,
      newShipFighters: player.ship_fighters + count,
      remainingInSector: remaining
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Check if sector has hostile fighters (not owned by player)
 */
export const getHostileFighters = async (
  playerId: number,
  universeId: number,
  sectorNumber: number
): Promise<DeployedFighters[]> => {
  const result = await query(
    `SELECT id, owner_id, owner_name, fighter_count, deployed_at
     FROM sector_fighters
     WHERE universe_id = $1 AND sector_number = $2 AND owner_id != $3 AND fighter_count > 0
     ORDER BY fighter_count DESC`,
    [universeId, sectorNumber, playerId]
  );
  
  return result.rows.map(r => ({
    id: r.id,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    fighterCount: r.fighter_count,
    deployedAt: r.deployed_at
  }));
};

/**
 * Attack stationed fighters (player attacks the sector defense)
 */
export const attackSectorFighters = async (
  attackerId: number,
  deploymentId: number
): Promise<{
  success: boolean;
  message: string;
  attackerWon: boolean;
  attackerFightersLost: number;
  defenderFightersLost: number;
  attackerShieldsLost: number;
}> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get attacker data
    const attackerResult = await client.query(
      `SELECT p.id, p.universe_id, p.current_sector, p.ship_fighters, p.ship_shields, p.corp_name, u.username
       FROM players p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1 FOR UPDATE`,
      [attackerId]
    );

    if (attackerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found', attackerWon: false, attackerFightersLost: 0, defenderFightersLost: 0, attackerShieldsLost: 0 };
    }

    const attacker = attackerResult.rows[0];

    // Get deployed fighters
    const deployedResult = await client.query(
      `SELECT id, universe_id, sector_number, owner_id, owner_name, fighter_count
       FROM sector_fighters WHERE id = $1 FOR UPDATE`,
      [deploymentId]
    );

    if (deployedResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Fighters not found', attackerWon: false, attackerFightersLost: 0, defenderFightersLost: 0, attackerShieldsLost: 0 };
    }

    const deployed = deployedResult.rows[0];

    // Validate same sector
    if (deployed.universe_id !== attacker.universe_id || deployed.sector_number !== attacker.current_sector) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Fighters are not in your sector', attackerWon: false, attackerFightersLost: 0, defenderFightersLost: 0, attackerShieldsLost: 0 };
    }

    // Cannot attack own fighters
    if (deployed.owner_id === attackerId) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Cannot attack your own fighters', attackerWon: false, attackerFightersLost: 0, defenderFightersLost: 0, attackerShieldsLost: 0 };
    }

    // Check attacker has fighters
    if (attacker.ship_fighters <= 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'You have no fighters to attack with', attackerWon: false, attackerFightersLost: 0, defenderFightersLost: 0, attackerShieldsLost: 0 };
    }

    // Combat simulation against stationed fighters (defenders have 0 shields)
    let attackerFighters = attacker.ship_fighters;
    let attackerShields = attacker.ship_shields;
    let defenderFighters = deployed.fighter_count;
    
    const initialAttackerFighters = attackerFighters;
    const initialAttackerShields = attackerShields;
    const initialDefenderFighters = defenderFighters;

    const maxRounds = 10;
    let round = 0;

    while (attackerFighters > 0 && defenderFighters > 0 && round < maxRounds) {
      round++;

      // Same combat mechanics as player combat with luck factor
      const attackerLuckFactor = 0.5 + Math.random();
      const defenderLuckFactor = 0.5 + Math.random();
      
      const attackerCritical = Math.random() < 0.10;
      const defenderCritical = Math.random() < 0.10;
      const attackerDodge = Math.random() < 0.15;
      const defenderDodge = Math.random() < 0.15;
      
      let attackerBaseDamage = Math.floor(attackerFighters * attackerLuckFactor);
      let defenderBaseDamage = Math.floor(defenderFighters * defenderLuckFactor);
      
      if (attackerCritical) attackerBaseDamage *= 2;
      if (defenderCritical) defenderBaseDamage *= 2;
      
      const attackerDamage = defenderDodge ? Math.floor(attackerBaseDamage * 0.5) : attackerBaseDamage;
      const defenderDamage = attackerDodge ? Math.floor(defenderBaseDamage * 0.5) : defenderBaseDamage;

      // Defender (stationed fighters) has no shields
      defenderFighters = Math.max(0, defenderFighters - attackerDamage);

      // Attacker takes damage (shields first)
      let damageToAttacker = defenderDamage;
      const shieldAbsorb = Math.min(attackerShields * 2, damageToAttacker);
      const shieldsLost = Math.ceil(shieldAbsorb / 2);
      attackerShields = Math.max(0, attackerShields - shieldsLost);
      damageToAttacker -= shieldAbsorb;
      attackerFighters = Math.max(0, attackerFighters - damageToAttacker);
    }

    const attackerWon = defenderFighters <= 0;
    const attackerFightersLost = initialAttackerFighters - attackerFighters;
    const attackerShieldsLost = initialAttackerShields - attackerShields;
    const defenderFightersLost = initialDefenderFighters - defenderFighters;

    // Apply results
    await client.query(
      `UPDATE players SET ship_fighters = $1, ship_shields = $2 WHERE id = $3`,
      [attackerFighters, attackerShields, attackerId]
    );

    if (defenderFighters <= 0) {
      await client.query(`DELETE FROM sector_fighters WHERE id = $1`, [deploymentId]);
    } else {
      await client.query(
        `UPDATE sector_fighters SET fighter_count = $1 WHERE id = $2`,
        [defenderFighters, deploymentId]
      );
    }

    // Notify the owner of deployed fighters
    if (deployed.owner_id) {
      await client.query(
        `INSERT INTO messages (universe_id, sender_id, recipient_id, sender_name, subject, body, message_type)
         SELECT $1, NULL, $2, $3, $4, $5, 'DIRECT'`,
        [
          deployed.universe_id,
          deployed.owner_id,
          `Sector ${deployed.sector_number} Defense`,
          attackerWon ? 'FIGHTERS DESTROYED' : 'FIGHTERS UNDER ATTACK',
          attackerWon 
            ? `⚠️ ALERT: Your ${initialDefenderFighters} fighters in Sector ${deployed.sector_number} were destroyed by ${attacker.username} (${attacker.corp_name})!`
            : `⚠️ ALERT: Your fighters in Sector ${deployed.sector_number} were attacked by ${attacker.username} (${attacker.corp_name})!\n\nFighters lost: ${defenderFightersLost}\nFighters remaining: ${defenderFighters}`
        ]
      );
    }

    await client.query('COMMIT');

    // Emit event
    emitSectorEvent(attacker.universe_id, attacker.current_sector, 'sector_fighters_attacked', {
      attackerName: attacker.corp_name,
      defenderName: deployed.owner_name,
      attackerWon,
      defenderFightersLost
    });

    const message = attackerWon
      ? `Victory! Destroyed ${deployed.owner_name}'s ${defenderFightersLost} fighters. Lost ${attackerFightersLost} fighters, ${attackerShieldsLost} shields.`
      : `Retreat! Lost ${attackerFightersLost} fighters, ${attackerShieldsLost} shields. ${defenderFighters} enemy fighters remain.`;

    return {
      success: true,
      message,
      attackerWon,
      attackerFightersLost,
      defenderFightersLost,
      attackerShieldsLost
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Retreat from sector (take 0-10% damage from stationed fighters)
 */
export const retreatFromSector = async (
  playerId: number,
  destinationSector: number
): Promise<{
  success: boolean;
  message: string;
  shieldsLost: number;
  fightersLost: number;
  newSector: number;
  died?: boolean;
}> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get player data
    const playerResult = await client.query(
      `SELECT p.id, p.universe_id, p.current_sector, p.ship_fighters, p.ship_shields, p.turns_remaining
       FROM players p WHERE p.id = $1 FOR UPDATE`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found', shieldsLost: 0, fightersLost: 0, newSector: 0 };
    }

    const player = playerResult.rows[0];

    // Check turns
    if (player.turns_remaining <= 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Not enough turns', shieldsLost: 0, fightersLost: 0, newSector: 0 };
    }

    // Verify destination is connected
    const sectorResult = await client.query(
      `SELECT s.id FROM sectors s WHERE s.universe_id = $1 AND s.sector_number = $2`,
      [player.universe_id, player.current_sector]
    );

    if (sectorResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Current sector not found', shieldsLost: 0, fightersLost: 0, newSector: 0 };
    }

    const currentSectorId = sectorResult.rows[0].id;

    // Check warp connection
    const warpResult = await client.query(
      `SELECT 1 FROM sector_warps sw
       WHERE (sw.sector_id = $1 AND sw.destination_sector_number = $2)
       OR EXISTS (
         SELECT 1 FROM sector_warps sw2
         JOIN sectors s ON sw2.sector_id = s.id
         WHERE s.universe_id = $3 AND s.sector_number = $2 
         AND sw2.destination_sector_number = $4 AND sw2.is_two_way = true
       )`,
      [currentSectorId, destinationSector, player.universe_id, player.current_sector]
    );

    if (warpResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'No warp connection to that sector', shieldsLost: 0, fightersLost: 0, newSector: 0 };
    }

    // Calculate retreat damage (0-10% of shields, then fighters)
    const damagePercent = Math.random() * 0.10; // 0-10%
    const totalDefense = player.ship_shields + player.ship_fighters;
    const totalDamage = Math.floor(totalDefense * damagePercent);

    let shieldsLost = Math.min(player.ship_shields, totalDamage);
    let fightersLost = Math.min(player.ship_fighters, totalDamage - shieldsLost);

    const remainingShields = player.ship_shields - shieldsLost;
    const remainingFighters = player.ship_fighters - fightersLost;

    // Check if player dies from retreat damage
    if (remainingFighters <= 0 && remainingShields <= 0) {
      // Player destroyed during retreat - respawn in escape pod
      const escapeSector = await findEscapeSector(player.universe_id, player.current_sector, client);

      await client.query(
        `UPDATE players SET
          ship_type = 'Escape Pod',
          ship_holds_max = 5,
          ship_fighters = 0,
          ship_shields = 0,
          ship_torpedoes = 0,
          ship_mines = 0,
          cargo_fuel = 0,
          cargo_organics = 0,
          cargo_equipment = 0,
          colonists = 0,
          current_sector = $1,
          in_escape_pod = TRUE,
          deaths = deaths + 1,
          turns_remaining = turns_remaining - 1
         WHERE id = $2`,
        [escapeSector, playerId]
      );

      await client.query('COMMIT');

      return {
        success: true,
        message: `💀 DESTROYED! You were killed by enemy fire while retreating! Respawned in Escape Pod at Sector ${escapeSector}.`,
        shieldsLost: player.ship_shields,
        fightersLost: player.ship_fighters,
        newSector: escapeSector,
        died: true
      };
    }

    // Apply damage and move
    await client.query(
      `UPDATE players SET
        ship_shields = ship_shields - $1,
        ship_fighters = ship_fighters - $2,
        current_sector = $3,
        turns_remaining = turns_remaining - 1
       WHERE id = $4`,
      [shieldsLost, fightersLost, destinationSector, playerId]
    );

    await client.query('COMMIT');

    const message = shieldsLost + fightersLost > 0
      ? `Retreated to Sector ${destinationSector}. Took ${shieldsLost} shield and ${fightersLost} fighter damage from enemy fire!`
      : `Retreated to Sector ${destinationSector}. Escaped unscathed!`;

    return {
      success: true,
      message,
      shieldsLost,
      fightersLost,
      newSector: destinationSector,
      died: false
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Charge daily maintenance for deployed fighters
 * Should be called daily (e.g., via cron job or daily tick)
 * Charges ₡5 per fighter per day from player's credits
 * If player can't afford maintenance, fighters are automatically retrieved (destroyed)
 */
export const chargeFighterMaintenance = async (): Promise<{
  totalCharged: number;
  fightersDestroyed: number;
  playersAffected: number;
}> => {
  const client = await getClient();
  let totalCharged = 0;
  let fightersDestroyed = 0;
  let playersAffected = 0;

  try {
    await client.query('BEGIN');

    // Get all deployed fighters that need maintenance (older than 24 hours)
    const fightersResult = await client.query(
      `SELECT sf.id, sf.owner_id, sf.fighter_count, sf.universe_id, sf.sector_number,
              p.credits, p.corp_name
       FROM sector_fighters sf
       JOIN players p ON sf.owner_id = p.id
       WHERE sf.fighter_count > 0
         AND (sf.last_maintenance IS NULL OR sf.last_maintenance < NOW() - INTERVAL '24 hours')
       FOR UPDATE OF sf, p`
    );

    for (const fighter of fightersResult.rows) {
      const maintenanceCost = fighter.fighter_count * MAINTENANCE_COST_PER_FIGHTER_PER_DAY;
      const playerCredits = parseInt(String(fighter.credits), 10) || 0;

      if (playerCredits >= maintenanceCost) {
        // Player can afford maintenance - charge them
        await client.query(
          `UPDATE players SET credits = credits - $1 WHERE id = $2`,
          [maintenanceCost, fighter.owner_id]
        );
        await client.query(
          `UPDATE sector_fighters SET last_maintenance = CURRENT_TIMESTAMP WHERE id = $1`,
          [fighter.id]
        );
        totalCharged += maintenanceCost;
        playersAffected++;
      } else {
        // Player can't afford maintenance - destroy fighters
        await client.query(
          `DELETE FROM sector_fighters WHERE id = $1`,
          [fighter.id]
        );
        fightersDestroyed += fighter.fighter_count;
        playersAffected++;

        // Notify player with detailed message
        await client.query(
          `INSERT INTO messages (universe_id, sender_id, recipient_id, sender_name, subject, body, message_type)
           VALUES ($1, NULL, $2, 'Banking System', '⚠️ Fighter Maintenance Failure', $3, 'DIRECT')`,
          [
            fighter.universe_id,
            fighter.owner_id,
            `💀 MAINTENANCE FAILURE: Your ${fighter.fighter_count} fighters in Sector ${fighter.sector_number} were destroyed!\n\n` +
            `Required: ₡${maintenanceCost.toLocaleString()} (₡5 per fighter per day)\n` +
            `Your balance: ₡${playerCredits.toLocaleString()}\n\n` +
            `Fighters require daily maintenance. Keep credits on-hand or in bank to avoid losing them!`
          ]
        );
      }
    }

    await client.query('COMMIT');

    return { totalCharged, fightersDestroyed, playersAffected };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

