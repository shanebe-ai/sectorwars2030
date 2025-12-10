/**
 * Alien Service
 * Handles alien ships, alien planets, and alien communications
 */

import { pool } from '../db/connection';

// Alien race names
const ALIEN_RACES = [
  'Xenthi', 'Vorlak', 'Krynn', 'Sslith', 'Zendarr',
  'Thorax', 'Quell', 'Nebari', 'Vedran', 'Pyrians'
];

// Alien ship name prefixes
const SHIP_PREFIXES = [
  'Warbird', 'Cruiser', 'Destroyer', 'Hunter', 'Stalker',
  'Phantom', 'Reaper', 'Corsair', 'Marauder', 'Raider'
];

interface AlienGenerationConfig {
  universeId: number;
  sectorCount: number;
  customPlanetCount?: number; // Override default formula
}

interface AlienPlanet {
  id: number;
  universeId: number;
  sectorNumber: number;
  name: string;
  alienRace: string;
  citadelLevel: number;
  colonists: number;
  fighters: number;
  fuel: number;
  organics: number;
  equipment: number;
}

interface AlienShip {
  id: number;
  universeId: number;
  alienRace: string;
  shipName: string;
  shipTypeId: number;
  currentSector: number;
  credits: number;
  fighters: number;
  shields: number;
  behavior: 'patrol' | 'trade' | 'aggressive' | 'defensive';
  homeSector?: number;
}

/**
 * Generate alien planets and ships based on universe size
 */
export async function generateAliensForUniverse(config: AlienGenerationConfig): Promise<void> {
  const { universeId, sectorCount, customPlanetCount } = config;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Determine alien planet and ship counts based on universe size
    let planetCount = 0;
    let shipCount = 0;

    // Use custom count if provided, otherwise use formula
    if (customPlanetCount !== undefined) {
      planetCount = customPlanetCount;
      // Calculate ship count based on custom planet count
      if (planetCount === 0) {
        shipCount = 1; // At least one ship even with no planets
      } else {
        shipCount = planetCount * 3 + Math.floor(Math.random() * planetCount * 2); // 2-5 ships per planet
      }
    } else if (sectorCount < 50) {
      planetCount = 0;
      shipCount = 1;
    } else if (sectorCount < 100) {
      planetCount = 1;
      shipCount = Math.floor(Math.random() * 2) + 1; // 1-2
    } else if (sectorCount < 500) {
      planetCount = Math.floor(Math.random() * 2) + 1; // 1-2
      shipCount = Math.floor(Math.random() * 2) + 3; // 3-4
    } else if (sectorCount < 1000) {
      planetCount = Math.floor(Math.random() * 3) + 2; // 2-4
      shipCount = Math.floor(Math.random() * 3) + 3; // 3-5
    } else {
      // 1000+ sectors: 0.3% alien planets (~3 per 1000 sectors)
      planetCount = Math.ceil(sectorCount * 0.003);
      shipCount = planetCount * 3 + Math.floor(Math.random() * planetCount * 2); // 2-5 ships per planet
    }

    // Get available sectors (exclude TerraSpace 1-10, and sectors with ports/planets)
    const sectorsResult = await client.query(`
      SELECT sector_number
      FROM sectors
      WHERE universe_id = $1
        AND sector_number > 10
        AND port_type IS NULL
        AND has_planet = FALSE
      ORDER BY RANDOM()
      LIMIT $2
    `, [universeId, planetCount]);

    const availableSectors = sectorsResult.rows.map(r => r.sector_number);

    // Get ship types for aliens (prefer Scout, Trader, Freighter, Merchant Cruiser)
    const shipTypesResult = await client.query(`
      SELECT id, name, holds, fighters_max, shields_max, cost_credits
      FROM ship_types
      WHERE (universe_id = $1 OR universe_id IS NULL)
        AND name IN ('Scout', 'Trader', 'Freighter', 'Merchant Cruiser')
      ORDER BY cost_credits ASC
    `, [universeId]);

    const shipTypes = shipTypesResult.rows;

    if (shipTypes.length === 0) {
      throw new Error('No suitable ship types found for aliens');
    }

    // Generate alien planets
    const alienPlanets: number[] = [];
    for (let i = 0; i < planetCount && i < availableSectors.length; i++) {
      const sectorNumber = availableSectors[i];
      const race = ALIEN_RACES[Math.floor(Math.random() * ALIEN_RACES.length)];
      const planetName = `${race} Homeworld ${String.fromCharCode(65 + i)}`; // A, B, C, etc.

      // Alien planets have strong defenses
      const citadelLevel = Math.floor(Math.random() * 2) + 3; // Level 3-4
      const colonists = Math.floor(Math.random() * 50000) + 50000; // 50K-100K
      const fighters = Math.floor(Math.random() * 1000) + 1000; // 1K-2K

      const planetResult = await client.query(`
        INSERT INTO alien_planets (
          universe_id, sector_number, name, alien_race,
          citadel_level, colonists, fighters,
          fuel, organics, equipment, production_type
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, sector_number
      `, [
        universeId, sectorNumber, planetName, race,
        citadelLevel, colonists, fighters,
        10000, 10000, 10000, 'balanced'
      ]);

      alienPlanets.push(planetResult.rows[0].sector_number);
      console.log(`  ✓ Created alien planet: ${planetName} in sector ${sectorNumber}`);
    }

    // Generate alien ships
    for (let i = 0; i < shipCount; i++) {
      const race = ALIEN_RACES[Math.floor(Math.random() * ALIEN_RACES.length)];
      const prefix = SHIP_PREFIXES[Math.floor(Math.random() * SHIP_PREFIXES.length)];
      const shipName = `${race} ${prefix} ${Math.floor(Math.random() * 900) + 100}`;

      // Choose ship type (bias toward middle-tier ships)
      const shipType = shipTypes[Math.min(Math.floor(Math.random() * 3) + 1, shipTypes.length - 1)];

      // Choose starting sector (prefer near alien planets if they exist)
      let startSector: number;
      if (alienPlanets.length > 0 && Math.random() < 0.7) {
        // 70% chance to start near an alien planet
        startSector = alienPlanets[Math.floor(Math.random() * alienPlanets.length)];
      } else {
        // Random sector outside TerraSpace
        startSector = Math.floor(Math.random() * (sectorCount - 10)) + 11;
      }

      // Choose behavior
      const behaviors: Array<'patrol' | 'trade' | 'aggressive' | 'defensive'> = [
        'patrol', 'aggressive', 'patrol', 'defensive', 'trade'
      ];
      const behavior = behaviors[Math.floor(Math.random() * behaviors.length)];

      // Alien ships are well-equipped (65-90% of max for better challenge)
      const fighters = Math.floor(shipType.fighters_max * (0.65 + Math.random() * 0.25));
      const shields = Math.floor(shipType.shields_max * (0.65 + Math.random() * 0.25));
      const credits = Math.floor(Math.random() * 50000) + 25000; // 25K-75K

      // Home sector for patrol (if near alien planet)
      const homeSector = alienPlanets.includes(startSector) ? startSector : null;

      // Alignment based on behavior: traders are neutral/friendly, others are hostile
      const alignment = behavior === 'trade' 
        ? Math.floor(Math.random() * 100) + 50 // Neutral to friendly (50-150)
        : -200; // Hostile for aggressive/patrol/defensive

      await client.query(`
        INSERT INTO alien_ships (
          universe_id, alien_race, ship_name, ship_type_id,
          current_sector, credits, fighters, shields,
          behavior, home_sector, alignment
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        universeId, race, shipName, shipType.id,
        startSector, credits, fighters, shields,
        behavior, homeSector, alignment
      ]);

      console.log(`  ✓ Created alien ship: ${shipName} in sector ${startSector} (${behavior})`);
    }

    await client.query('COMMIT');
    console.log(`✓ Generated ${planetCount} alien planets and ${shipCount} alien ships`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get all alien ships in a sector
 */
export async function getAlienShipsInSector(universeId: number, sectorNumber: number): Promise<AlienShip[]> {
  try {
    const result = await pool.query(`
      SELECT
        a.id, a.universe_id, a.alien_race, a.ship_name,
        a.ship_type_id, a.current_sector, a.credits,
        a.fighters, a.shields, a.behavior, a.home_sector,
        st.name as ship_type_name
      FROM alien_ships a
      LEFT JOIN ship_types st ON a.ship_type_id = st.id
      WHERE a.universe_id = $1 AND a.current_sector = $2
    `, [universeId, sectorNumber]);

    return result.rows.map(row => ({
      id: row.id,
      universeId: row.universe_id,
      alienRace: row.alien_race,
      shipName: row.ship_name,
      shipTypeId: row.ship_type_id,
      shipTypeName: row.ship_type_name || 'Unknown',
      currentSector: row.current_sector,
      credits: row.credits,
      fighters: row.fighters,
      shields: row.shields,
      behavior: row.behavior,
      homeSector: row.home_sector
    }));
  } catch (error: any) {
    console.error('Error in getAlienShipsInSector:', error);
    // Return empty array on error rather than throwing
    return [];
  }
}

/**
 * Get alien planet in sector (if any)
 */
export async function getAlienPlanetInSector(universeId: number, sectorNumber: number): Promise<AlienPlanet | null> {
  const result = await pool.query(`
    SELECT * FROM alien_planets
    WHERE universe_id = $1 AND sector_number = $2
  `, [universeId, sectorNumber]);

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    universeId: row.universe_id,
    sectorNumber: row.sector_number,
    name: row.name,
    alienRace: row.alien_race,
    citadelLevel: row.citadel_level,
    colonists: row.colonists,
    fighters: row.fighters,
    fuel: row.fuel,
    organics: row.organics,
    equipment: row.equipment
  };
}

/**
 * Unlock alien communications for a player
 */
export async function unlockAlienComms(playerId: number, universeId: number): Promise<void> {
  await pool.query(`
    INSERT INTO player_alien_unlocks (player_id, universe_id)
    VALUES ($1, $2)
    ON CONFLICT (player_id, universe_id) DO NOTHING
  `, [playerId, universeId]);

  // Update player record
  await pool.query(`
    UPDATE players SET has_alien_comms = TRUE
    WHERE id = $1
  `, [playerId]);
}

/**
 * Check if player has alien comms unlocked
 */
export async function hasAlienComms(playerId: number): Promise<boolean> {
  const result = await pool.query(`
    SELECT has_alien_comms FROM players WHERE id = $1
  `, [playerId]);

  return result.rows[0]?.has_alien_comms || false;
}

/**
 * Broadcast alien communication message
 */

/**
 * Get alien communications for a player (if unlocked)
 */
export async function getAlienCommunications(
  playerId: number,
  universeId: number,
  limit: number = 50
): Promise<any[]> {
  // Check if player has alien comms
  const hasComms = await hasAlienComms(playerId);
  if (!hasComms) {
    return [];
  }

  // Get player's join date to filter messages
  const playerResult = await pool.query(`
    SELECT created_at FROM players WHERE id = $1
  `, [playerId]);

  const playerJoinDate = playerResult.rows[0]?.created_at;

  const result = await pool.query(`
    SELECT
      ac.*,
      u.username as player_username,
      p.corp_name as player_corp
    FROM alien_communications ac
    LEFT JOIN players p ON ac.related_player_id = p.id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE ac.universe_id = $1
      AND ac.created_at >= $2
    ORDER BY ac.created_at DESC
    LIMIT $3
  `, [universeId, playerJoinDate, limit]);

  return result.rows;
}

/**
 * Move alien ships (called periodically by game tick)
 */
export async function moveAlienShips(universeId: number): Promise<void> {
  const client = await pool.connect();

  try {
    // Get all alien ships that haven't moved recently (e.g., last 5 minutes)
    const shipsResult = await client.query(`
      SELECT a.*, st.fighters_max, st.shields_max
      FROM alien_ships a
      JOIN ship_types st ON a.ship_type_id = st.id
      WHERE a.universe_id = $1
        AND (a.last_move_at IS NULL OR a.last_move_at < NOW() - INTERVAL '5 minutes')
    `, [universeId]);

    for (const ship of shipsResult.rows) {
      // Get current sector ID
      const sectorResult = await client.query(`
        SELECT id FROM sectors WHERE universe_id = $1 AND sector_number = $2
      `, [universeId, ship.current_sector]);

      if (sectorResult.rows.length === 0) continue;
      const sectorId = sectorResult.rows[0].id;

      // Get valid warp destinations (bidirectional lookup)
      const warpsResult = await client.query(`
        SELECT DISTINCT
          CASE
            WHEN sw.sector_id = $1 THEN sw.destination_sector_number
            ELSE (SELECT sector_number FROM sectors WHERE id = sw.sector_id)
          END as destination
        FROM sector_warps sw
        JOIN sectors s ON sw.sector_id = s.id
        WHERE s.universe_id = $2 AND (sw.sector_id = $1 OR sw.destination_sector_number = $3)
      `, [sectorId, universeId, ship.current_sector]);

      if (warpsResult.rows.length === 0) continue;

      // Choose movement based on behavior
      let nextSector = ship.current_sector;
      const validWarps = warpsResult.rows.map(r => r.destination).filter(s => s !== ship.current_sector);

      if (validWarps.length === 0) continue;

      if (ship.behavior === 'patrol' && ship.home_sector) {
        // Patrol around home sector - stay within 2-3 jumps
        nextSector = validWarps[Math.floor(Math.random() * validWarps.length)];
      } else if (ship.behavior === 'aggressive') {
        // Move toward player-populated sectors (if any nearby)
        const playerSectors = await client.query(`
          SELECT current_sector FROM players
          WHERE universe_id = $1 AND current_sector = ANY($2::int[]) AND is_alive = true
        `, [universeId, validWarps]);

        if (playerSectors.rows.length > 0) {
          // Move toward players
          nextSector = playerSectors.rows[0].current_sector;
        } else {
          // Random movement
          nextSector = validWarps[Math.floor(Math.random() * validWarps.length)];
        }
      } else {
        // Random movement for trade/defensive behaviors
        nextSector = validWarps[Math.floor(Math.random() * validWarps.length)];
      }

      // Update ship position
      await client.query(`
        UPDATE alien_ships
        SET current_sector = $1, last_move_at = NOW()
        WHERE id = $2
      `, [nextSector, ship.id]);

      // Check for mines in the new sector
      const mineService = require('./mineService');
      const mineResult = await mineService.checkMinesOnAlienEntry(ship.id, universeId, nextSector);

      if (mineResult.triggered && mineResult.totalDamage > 0) {
        // Apply mine damage to alien ship
        const newFighters = Math.max(0, ship.fighters - mineResult.fightersLost);
        const newShields = Math.max(0, ship.shields - mineResult.shieldsLost);

        await client.query(`
          UPDATE alien_ships SET fighters = $1, shields = $2 WHERE id = $3
        `, [newFighters, newShields, ship.id]);

        // Broadcast mine explosion
        const { broadcastAlienComms } = require('./broadcastService');
        await broadcastAlienComms(universeId, 'combat',
          `💥 ${ship.alien_race} vessel "${ship.ship_name}" triggered ${mineResult.minesDestroyed} mines in Sector ${nextSector}! Damage: ${mineResult.totalDamage}`,
          {
            alienRace: ship.alien_race,
            sectorNumber: nextSector,
            relatedShipId: ship.id
          }
        );

        // If alien was destroyed by mines, delete it
        if (newFighters <= 0) {
          await client.query(`DELETE FROM alien_ships WHERE id = $1`, [ship.id]);
          const { broadcastAlienComms } = require('./broadcastService');
          await broadcastAlienComms(universeId, 'combat',
            `💀 ${ship.alien_race} vessel "${ship.ship_name}" DESTROYED by mines in Sector ${nextSector}!`,
            {
              alienRace: ship.alien_race,
              sectorNumber: nextSector
            }
          );
          continue; // Skip to next ship
        }
      }

      // Check for deployed fighters in the new sector
      const fighterService = require('./sectorFighterService');
      const hostileFighters = await fighterService.getHostileFightersForAlien(ship.id, universeId, nextSector);

      if (hostileFighters.length > 0) {
        // Alien encounters deployed fighters - decide to fight or flee
        const totalHostileFighters = hostileFighters.reduce((sum: number, f: any) => sum + f.fighterCount, 0);
        const alienStrength = ship.fighters + ship.shields;
        const fighterStrength = totalHostileFighters;

        // Aliens flee if significantly outmatched (less than 50% strength)
        if (alienStrength < fighterStrength * 0.5) {
          // Flee back to previous sector
          await client.query(`
            UPDATE alien_ships SET current_sector = $1 WHERE id = $2
          `, [ship.current_sector, ship.id]); // Revert to old sector

          // Notify fighter owners of retreat
          for (const deployment of hostileFighters) {
            await client.query(`
              INSERT INTO messages (player_id, sender_name, subject, body, message_type, is_read)
              VALUES ($1, 'SYSTEM', $2, $3, 'inbox', false)
            `, [
              deployment.ownerId,
              `Alien Retreat - Sector ${nextSector}`,
              `${ship.alien_race} vessel "${ship.ship_name}" retreated from your deployed fighters in Sector ${nextSector}!\n\nYour Fighters: ${deployment.fighterCount}\nAlien Strength: ${ship.fighters} fighters, ${ship.shields} shields`
            ]);
          }

          const { broadcastAlienComms } = require('./broadcastService');
          await broadcastAlienComms(universeId, 'combat',
            `🛡️ ${ship.alien_race} vessel "${ship.ship_name}" RETREATED from deployed fighters in Sector ${nextSector}`,
            {
              alienRace: ship.alien_race,
              sectorNumber: nextSector,
              relatedShipId: ship.id
            }
          );
          continue; // Skip to next ship
        } else {
          // Alien attacks the fighters
          const combatService = require('./sectorFighterService');
          for (const deployment of hostileFighters) {
            const attackResult = await combatService.alienAttackDeployedFighters(
              ship.id, deployment.id, universeId, nextSector
            );

            // Update alien ship with losses
            ship.fighters = attackResult.alienFightersRemaining;
            ship.shields = attackResult.alienShieldsRemaining;

            // Notify fighter owner
            await client.query(`
              INSERT INTO messages (player_id, sender_name, subject, body, message_type, is_read)
              VALUES ($1, 'SYSTEM', $2, $3, 'inbox', false)
            `, [
              deployment.ownerId,
              `Fighters Under Attack - Sector ${nextSector}`,
              `${ship.alien_race} vessel "${ship.ship_name}" attacked your deployed fighters in Sector ${nextSector}!\n\n` +
              `Combat Result:\n` +
              `Your Losses: ${attackResult.fightersDestroyed} fighters\n` +
              `Alien Losses: ${attackResult.alienFightersLost} fighters, ${attackResult.alienShieldsLost} shields\n` +
              `Surviving Fighters: ${attackResult.fightersRemaining}`
            ]);

            // If alien was destroyed, stop processing
            if (ship.fighters <= 0) {
              await client.query(`DELETE FROM alien_ships WHERE id = $1`, [ship.id]);
              const { broadcastAlienComms } = require('./broadcastService');
              await broadcastAlienComms(universeId, 'combat',
                `⚔️ ${ship.alien_race} vessel "${ship.ship_name}" DESTROYED by deployed fighters in Sector ${nextSector}!`,
                {
                  alienRace: ship.alien_race,
                  sectorNumber: nextSector
                }
              );
              break; // Exit fighter loop
            }
          }

          if (ship.fighters <= 0) {
            continue; // Skip to next alien ship
          }
        }
      }

      // Broadcast movement to alien comms (only sometimes to avoid spam)
      if (Math.random() < 0.3) { // 30% chance to broadcast movement
        const { broadcastAlienComms } = require('./broadcastService');
        await broadcastAlienComms(universeId, 'sector_entry',
          `${ship.alien_race} vessel "${ship.ship_name}" detected entering Sector ${nextSector}`,
          {
            alienRace: ship.alien_race,
            sectorNumber: nextSector,
            relatedShipId: ship.id
          }
        );
      }

      // Check for player encounters in new sector
      const playersInSector = await client.query(`
        SELECT p.id, u.username, p.corp_name
        FROM players p
        JOIN users u ON p.user_id = u.id
        WHERE p.universe_id = $1 AND p.current_sector = $2 AND p.is_alive = true
      `, [universeId, nextSector]);

      for (const player of playersInSector.rows) {
        const { broadcastAlienComms } = require('./broadcastService');
        await broadcastAlienComms(universeId, 'encounter',
          `Encounter detected: ${player.username} (${player.corp_name || 'Independent'}) and ${ship.ship_name} in Sector ${nextSector}`,
          {
            alienRace: ship.alien_race,
            sectorNumber: nextSector,
            relatedPlayerId: player.id,
            relatedShipId: ship.id
          }
        );
      }
    }
  } finally {
    client.release();
  }
}

/**
 * Move alien ships for all active universes (called periodically)
 */
export async function moveAllAlienShips(): Promise<void> {
  try {
    const universesResult = await pool.query(`
      SELECT DISTINCT universe_id FROM alien_ships
    `);

    for (const row of universesResult.rows) {
      await moveAlienShips(row.universe_id).catch(err => {
        console.error(`Error moving alien ships for universe ${row.universe_id}:`, err);
      });
    }
  } catch (error) {
    console.error('Error in moveAllAlienShips:', error);
  }
}

/**
 * Process alien aggression - aggressive aliens attack nearby players
 * Called periodically after alien movement
 */
export async function processAlienAggression(universeId: number): Promise<void> {
  const client = await pool.connect();

  try {
    // Get aggressive alien ships
    const aggressiveShipsResult = await client.query(`
      SELECT a.*, st.fighters_max, st.shields_max
      FROM alien_ships a
      JOIN ship_types st ON a.ship_type_id = st.id
      WHERE a.universe_id = $1
        AND a.behavior = 'aggressive'
        AND a.fighters > 0
    `, [universeId]);

    console.log(`[Alien Aggression] Found ${aggressiveShipsResult.rows.length} aggressive aliens in universe ${universeId}`);

    for (const alienShip of aggressiveShipsResult.rows) {
      // Get players in same sector
      const playersResult = await client.query(`
        SELECT p.id, p.user_id, p.current_sector, p.ship_fighters, p.ship_shields,
               p.is_alive, p.in_escape_pod, u.username, p.corp_name, s.region
        FROM players p
        JOIN users u ON p.user_id = u.id
        JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
        WHERE p.universe_id = $1
          AND p.current_sector = $2
          AND p.is_alive = true
          AND p.in_escape_pod = false
          AND p.ship_fighters > 0
      `, [universeId, alienShip.current_sector]);

      if (playersResult.rows.length === 0) continue;

      // Check if sector is TerraSpace (no combat allowed)
      const player = playersResult.rows[0];
      if (player.region === 'TerraSpace') {
        continue; // Skip TerraSpace combat
      }

      // 50% chance to attack if players present
      if (Math.random() < 0.5) {
        // Pick a random player to attack
        const targetPlayer = playersResult.rows[Math.floor(Math.random() * playersResult.rows.length)];

        console.log(`[Alien Aggression] ${alienShip.ship_name} attacking ${targetPlayer.username} in sector ${alienShip.current_sector}`);

        try {
          // Execute alien-initiated attack
          await alienAttacksPlayer(alienShip.id, targetPlayer.id, client);
        } catch (attackError) {
          console.error(`[Alien Aggression] Error in attack:`, attackError);
          // Continue to next alien ship
        }
      }
    }
  } finally {
    client.release();
  }
}

/**
 * Process alien aggression for all active universes
 */
export async function processAllAlienAggression(): Promise<void> {
  try {
    const universesResult = await pool.query(`
      SELECT DISTINCT universe_id FROM alien_ships WHERE behavior = 'aggressive'
    `);

    for (const row of universesResult.rows) {
      await processAlienAggression(row.universe_id).catch(err => {
        console.error(`Error processing alien aggression for universe ${row.universe_id}:`, err);
      });
    }
  } catch (error) {
    console.error('Error in processAllAlienAggression:', error);
  }
}

/**
 * Start automatic alien ship movement (runs every 5 minutes)
 */
export const startAlienShipMovement = (intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout => {
  console.log(`[Alien Movement] Starting automatic alien ship movement every ${intervalMs / 1000} seconds`);

  // Run immediately once
  moveAllAlienShips().catch(console.error);

  // Then run on interval
  return setInterval(() => {
    moveAllAlienShips().catch(console.error);
  }, intervalMs);
};

/**
 * Start automatic alien aggression processing (runs every 10 minutes)
 */
export const startAlienAggression = (intervalMs: number = 10 * 60 * 1000): NodeJS.Timeout => {
  console.log(`[Alien Aggression] Starting automatic alien aggression every ${intervalMs / 1000} seconds`);

  // Run after 2 minutes (offset from movement)
  setTimeout(() => {
    processAllAlienAggression().catch(console.error);
  }, 2 * 60 * 1000);

  // Then run on interval
  return setInterval(() => {
    processAllAlienAggression().catch(console.error);
  }, intervalMs);
};

/**
 * Combat constants for alien encounters
 */
const ALIEN_LOOT_PERCENTAGE = 0.75; // 75% loot from destroyed alien ships
const ALIEN_DEATH_PENALTY = 0.25; // 25% penalty for player death

interface AlienCombatResult {
  success: boolean;
  winner: 'player' | 'alien' | 'draw';
  rounds: number;
  playerFightersLost: number;
  alienFightersLost: number;
  playerShieldsLost: number;
  alienShieldsLost: number;
  alienDestroyed: boolean;
  playerDestroyed: boolean;
  creditsLooted: number;
  playerEscapeSector: number | null;
  message: string;
  combatLog: Array<{
    round: number;
    playerFighters: number;
    alienFighters: number;
    playerShields: number;
    alienShields: number;
    playerDamageDealt: number;
    alienDamageDealt: number;
    description: string;
  }>;
}

/**
 * Player attacks an alien ship
 */
export async function attackAlienShip(
  playerId: number,
  alienShipId: number
): Promise<AlienCombatResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get player stats
    const playerResult = await client.query(`
      SELECT p.*, u.username, s.region, COALESCE(ba.balance, 0) as bank_balance
      FROM players p
      JOIN users u ON p.user_id = u.id
      JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
      LEFT JOIN bank_accounts ba ON ba.player_id = p.id
      WHERE p.id = $1
      FOR UPDATE OF p
    `, [playerId]);

    if (playerResult.rows.length === 0) {
      throw new Error('Player not found');
    }

    const player = playerResult.rows[0];

    // Get alien ship stats
    // Use SKIP LOCKED to avoid waiting on contested rows - if another attack is in progress, fail fast
    const alienResult = await client.query(`
      SELECT a.*, st.fighters_max, st.shields_max, st.holds as holds_max
      FROM alien_ships a
      JOIN ship_types st ON a.ship_type_id = st.id
      WHERE a.id = $1
      FOR UPDATE OF a SKIP LOCKED
    `, [alienShipId]);

    if (alienResult.rows.length === 0) {
      throw new Error('Alien ship is currently engaged in combat or not found. Please try again in a moment.');
    }

    const alien = alienResult.rows[0];

    // Validation checks
    if (!player.is_alive) {
      throw new Error('You are not alive');
    }

    if (player.in_escape_pod) {
      throw new Error('Cannot attack while in an escape pod');
    }

    if (player.universe_id !== alien.universe_id) {
      throw new Error('Alien ship is in a different universe');
    }

    if (player.current_sector !== alien.current_sector) {
      throw new Error('Alien ship is not in your sector');
    }

    if (player.region === 'TerraSpace') {
      throw new Error('Combat is disabled in TerraSpace (safe zone)');
    }

    if (player.ship_fighters <= 0) {
      throw new Error('You have no fighters to attack with');
    }

    if (player.turns_remaining <= 0) {
      throw new Error('Not enough turns remaining');
    }

    // Run combat simulation
    const combatResult = simulateAlienCombat(
      { fighters: player.ship_fighters, shields: player.ship_shields },
      { fighters: alien.fighters, shields: alien.shields }
    );

    // Apply combat results to player
    const playerFightersRemaining = player.ship_fighters - combatResult.playerFightersLost;
    const playerShieldsRemaining = player.ship_shields - combatResult.playerShieldsLost;

    // Deduct turn
    await client.query(
      'UPDATE players SET turns_remaining = turns_remaining - 1, last_combat_at = NOW() WHERE id = $1',
      [playerId]
    );

    // Handle player death
    if (combatResult.playerDestroyed) {
      // Find escape sector
      const escapeSector = await findEscapeSector(client, player.universe_id, player.current_sector);

      // Apply death penalty (25% credits and bank balance)
      await client.query(`
        UPDATE players SET
          credits = GREATEST(0, FLOOR(credits * (1.0 - $1::numeric))),
          ship_type = 'Escape Pod',
          ship_holds_max = 5,
          ship_fighters = 0,
          ship_shields = 0,
          ship_mines = 0,
          ship_beacons = 0,
          ship_genesis = 0,
          cargo_fuel = 0,
          cargo_organics = 0,
          cargo_equipment = 0,
          colonists = 0,
          current_sector = $2,
          in_escape_pod = TRUE,
          deaths = deaths + 1
        WHERE id = $3
      `, [ALIEN_DEATH_PENALTY, escapeSector, playerId]);

      // Apply bank penalty
      await client.query(`
        UPDATE bank_accounts SET
          balance = GREATEST(0, FLOOR(balance * (1.0 - $1::numeric)))
        WHERE player_id = $2
      `, [ALIEN_DEATH_PENALTY, playerId]);

      combatResult.playerEscapeSector = escapeSector;
      combatResult.message = `💀 DESTROYED! The ${alien.ship_name} destroyed your ship! You escaped in a pod to Sector ${escapeSector}. Lost 25% of credits and bank balance.`;
    } else {
      // Update player fighters/shields
      await client.query(`
        UPDATE players SET
          ship_fighters = $1,
          ship_shields = $2,
          kills = kills + $3
        WHERE id = $4
      `, [playerFightersRemaining, playerShieldsRemaining, combatResult.alienDestroyed ? 1 : 0, playerId]);
    }

    // Handle alien destruction
    if (combatResult.alienDestroyed) {
      // Calculate loot
      const creditsLooted = Math.floor(alien.credits * ALIEN_LOOT_PERCENTAGE);

      // Grant credits to player
      await client.query(
        'UPDATE players SET credits = credits + $1 WHERE id = $2',
        [creditsLooted, playerId]
      );

      // Delete alien ship
      await client.query('DELETE FROM alien_ships WHERE id = $1', [alienShipId]);

      combatResult.creditsLooted = creditsLooted;
      combatResult.message = `⚔️ VICTORY! You destroyed the ${alien.alien_race} ship "${alien.ship_name}"! Looted ₡${creditsLooted.toLocaleString()}!`;
    } else {
      // Update alien fighters/shields
      const alienFightersRemaining = alien.fighters - combatResult.alienFightersLost;
      const alienShieldsRemaining = alien.shields - combatResult.alienShieldsLost;

      await client.query(`
        UPDATE alien_ships SET
          fighters = $1,
          shields = $2
        WHERE id = $3
      `, [alienFightersRemaining, alienShieldsRemaining, alienShipId]);

      if (!combatResult.playerDestroyed) {
        combatResult.message = `⚔️ Combat ended! ${alien.ship_name} survived with ${alienFightersRemaining} fighters and ${alienShieldsRemaining} shields.`;
      }
    }

    await client.query('COMMIT');
    combatResult.success = true;

    // Broadcast alien comms AFTER commit to avoid transaction deadlocks
    // Always broadcast alien interactions for realistic alien chatter
    try {
      const { broadcastAlienComms } = require('./broadcastService');

      if (combatResult.alienDestroyed) {
        await broadcastAlienComms(alien.universe_id, 'combat',
          `⚠️ ALERT: ${alien.alien_race} vessel "${alien.ship_name}" destroyed by ${player.username} in Sector ${player.current_sector}!`,
          {
            alienRace: alien.alien_race,
            sectorNumber: player.current_sector,
            relatedPlayerId: playerId,
            relatedShipId: alienShipId
          }
        );
      } else if (combatResult.playerDestroyed) {
        await broadcastAlienComms(alien.universe_id, 'combat',
          `🎯 ${alien.alien_race} vessel "${alien.ship_name}" repelled attack by ${player.username} in Sector ${player.current_sector}`,
          {
            alienRace: alien.alien_race,
            sectorNumber: player.current_sector,
            relatedPlayerId: playerId,
            relatedShipId: alienShipId
          }
        );
      } else {
        // Draw - both survived
        await broadcastAlienComms(alien.universe_id, 'combat',
          `⚔️ ${alien.alien_race} vessel "${alien.ship_name}" engaged in combat with ${player.username} in Sector ${player.current_sector} - both survived`,
          {
            alienRace: alien.alien_race,
            sectorNumber: player.current_sector,
            relatedPlayerId: playerId,
            relatedShipId: alienShipId
          }
        );
      }

      // TNN broadcast if player was destroyed
      if (combatResult.playerDestroyed) {
        const { broadcastTNN } = require('./broadcastService');
        await broadcastTNN(
          alien.universe_id,
          '💀 Ship Destroyed',
          `${player.username} (${player.corp_name}) was destroyed by ${alien.alien_race} vessel "${alien.ship_name}" in Sector ${player.current_sector}`
        );
      }
    } catch (broadcastError) {
      console.error('[AlienShip] broadcast failed:', broadcastError);
    }

    return combatResult;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Simulate combat between player and alien
 */
function simulateAlienCombat(
  player: { fighters: number; shields: number },
  alien: { fighters: number; shields: number }
): AlienCombatResult {
  const combatLog: any[] = [];
  let round = 0;
  const maxRounds = 100;

  let playerFighters = player.fighters;
  let playerShields = player.shields;
  let alienFighters = alien.fighters;
  let alienShields = alien.shields;

  while (round < maxRounds && playerFighters > 0 && alienFighters > 0) {
    round++;

    // Calculate damage
    const playerDamage = playerFighters;
    const alienDamage = alienFighters;

    // Apply damage (shields first, then fighters)
    let alienShieldsLost = 0;
    let alienFightersLost = 0;
    if (playerDamage > alienShields) {
      alienShieldsLost = alienShields;
      alienFightersLost = Math.min(alienFighters, playerDamage - alienShields);
    } else {
      alienShieldsLost = playerDamage;
    }

    let playerShieldsLost = 0;
    let playerFightersLost = 0;
    if (alienDamage > playerShields) {
      playerShieldsLost = playerShields;
      playerFightersLost = Math.min(playerFighters, alienDamage - playerShields);
    } else {
      playerShieldsLost = alienDamage;
    }

    // Apply losses
    alienShields -= alienShieldsLost;
    alienFighters -= alienFightersLost;
    playerShields -= playerShieldsLost;
    playerFighters -= playerFightersLost;

    combatLog.push({
      round,
      playerFighters,
      alienFighters,
      playerShields,
      alienShields,
      playerDamageDealt: playerDamage,
      alienDamageDealt: alienDamage,
      description: `Round ${round}: Player dealt ${playerDamage} damage, Alien dealt ${alienDamage} damage`
    });

    // End early if one side is destroyed
    if (playerFighters <= 0 || alienFighters <= 0) {
      break;
    }
  }

  return {
    success: false,
    winner: playerFighters > 0 ? (alienFighters > 0 ? 'draw' : 'player') : 'alien',
    rounds: round,
    playerFightersLost: player.fighters - playerFighters,
    alienFightersLost: alien.fighters - alienFighters,
    playerShieldsLost: player.shields - playerShields,
    alienShieldsLost: alien.shields - alienShields,
    alienDestroyed: alienFighters <= 0,
    playerDestroyed: playerFighters <= 0,
    creditsLooted: 0,
    playerEscapeSector: null,
    message: '',
    combatLog
  };
}

/**
 * Alien ship attacks a player (AI-initiated combat)
 * This is called by the aggression system, not by player action
 */
async function alienAttacksPlayer(
  alienShipId: number,
  playerId: number,
  client: any
): Promise<void> {
  try {
    await client.query('BEGIN');

    // Get alien ship stats
    const alienResult = await client.query(`
      SELECT a.*, st.fighters_max, st.shields_max
      FROM alien_ships a
      JOIN ship_types st ON a.ship_type_id = st.id
      WHERE a.id = $1
      FOR UPDATE OF a
    `, [alienShipId]);

    if (alienResult.rows.length === 0) {
      throw new Error('Alien ship not found');
    }

    const alien = alienResult.rows[0];

    // Get player stats
    const playerResult = await client.query(`
      SELECT p.*, u.username
      FROM players p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1
      FOR UPDATE OF p
    `, [playerId]);

    if (playerResult.rows.length === 0) {
      throw new Error('Player not found');
    }

    const player = playerResult.rows[0];

    // Run combat simulation
    const combatResult = simulateAlienCombat(
      { fighters: player.ship_fighters, shields: player.ship_shields },
      { fighters: alien.fighters, shields: alien.shields }
    );

    // Send inbox message to player about the attack
    const attackMessage = {
      subject: `⚠️ ALIEN ATTACK!`,
      body: `You were attacked by ${alien.alien_race} ship "${alien.ship_name}" in Sector ${player.current_sector}!`
    };

    // Handle player destruction
    if (combatResult.playerDestroyed) {
      const escapeSector = await findEscapeSector(client, player.universe_id, player.current_sector);

      // Apply death penalty
      await client.query(`
        UPDATE players SET
          credits = GREATEST(0, FLOOR(credits * (1.0 - $1::numeric))),
          ship_type = 'Escape Pod',
          ship_holds_max = 5,
          ship_fighters = 0,
          ship_shields = 0,
          ship_mines = 0,
          ship_beacons = 0,
          ship_genesis = 0,
          cargo_fuel = 0,
          cargo_organics = 0,
          cargo_equipment = 0,
          colonists = 0,
          current_sector = $2,
          in_escape_pod = TRUE,
          deaths = deaths + 1
        WHERE id = $3
      `, [ALIEN_DEATH_PENALTY, escapeSector, playerId]);

      // Apply bank penalty
      await client.query(`
        UPDATE bank_accounts SET
          balance = GREATEST(0, FLOOR(balance * (1.0 - $1::numeric)))
        WHERE player_id = $2
      `, [ALIEN_DEATH_PENALTY, playerId]);

      attackMessage.body += `\n\n💀 YOU WERE DESTROYED!\n\nYou lost 25% of your credits and bank balance.\nYou respawned in an Escape Pod at Sector ${escapeSector}.`;

      // Alien loots credits
      const creditsLooted = Math.floor(player.credits * ALIEN_LOOT_PERCENTAGE);
      await client.query(
        'UPDATE alien_ships SET credits = credits + $1 WHERE id = $2',
        [creditsLooted, alienShipId]
      );
    } else {
      // Update player fighters/shields
      const playerFightersRemaining = player.ship_fighters - combatResult.playerFightersLost;
      const playerShieldsRemaining = player.ship_shields - combatResult.playerShieldsLost;

      await client.query(`
        UPDATE players SET
          ship_fighters = $1,
          ship_shields = $2
        WHERE id = $3
      `, [playerFightersRemaining, playerShieldsRemaining, playerId]);

      attackMessage.body += `\n\nYou survived!\nFighters lost: ${combatResult.playerFightersLost}\nShields lost: ${combatResult.playerShieldsLost}`;
    }

    // Handle alien destruction
    if (combatResult.alienDestroyed) {
      await client.query('DELETE FROM alien_ships WHERE id = $1', [alienShipId]);

      attackMessage.body += `\n\n⚔️ You destroyed the alien ship in self-defense!`;
    } else {
      // Update alien fighters/shields
      const alienFightersRemaining = alien.fighters - combatResult.alienFightersLost;
      const alienShieldsRemaining = alien.shields - combatResult.alienShieldsLost;

      await client.query(`
        UPDATE alien_ships SET
          fighters = $1,
          shields = $2
        WHERE id = $3
      `, [alienFightersRemaining, alienShieldsRemaining, alienShipId]);
    }

    // Send inbox message to player
    await client.query(`
      INSERT INTO messages (player_id, sender_name, subject, body, message_type, is_read)
      VALUES ($1, $2, $3, $4, 'inbox', false)
    `, [playerId, 'SYSTEM', attackMessage.subject, attackMessage.body]);

    await client.query('COMMIT');

    // Broadcast alien comms AFTER commit to avoid transaction deadlocks
    try {
      const { broadcastAlienComms } = require('./broadcastService');
      if (combatResult.alienDestroyed) {
        await broadcastAlienComms(alien.universe_id, 'combat',
          `⚠️ ${alien.alien_race} vessel "${alien.ship_name}" destroyed by ${player.username} in self-defense (Sector ${player.current_sector})`,
          {
            alienRace: alien.alien_race,
            sectorNumber: player.current_sector,
            relatedPlayerId: playerId
          }
        );
      } else {
        await broadcastAlienComms(alien.universe_id, 'combat',
          `⚔️ ${alien.alien_race} vessel "${alien.ship_name}" engaged ${player.username} in combat (Sector ${player.current_sector})`,
          {
            alienRace: alien.alien_race,
            sectorNumber: player.current_sector,
            relatedPlayerId: playerId,
            relatedShipId: alienShipId
          }
        );
      }
    } catch (broadcastError) {
      console.error('[AlienAttackPlayer] broadcast failed:', broadcastError);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Attack an alien planet
 * Player attempts to attack an alien-controlled planet
 */
export async function attackAlienPlanet(
  playerId: number,
  planetId: number
): Promise<AlienCombatResult> {
  const client = await pool.connect();

  const combatResult: AlienCombatResult = {
    success: false,
    winner: 'draw',
    rounds: 0,
    playerFightersLost: 0,
    alienFightersLost: 0,
    playerShieldsLost: 0,
    alienShieldsLost: 0,
    alienDestroyed: false,
    playerDestroyed: false,
    creditsLooted: 0,
    playerEscapeSector: null,
    message: '',
    combatLog: []
  };

  try {
    await client.query('BEGIN');
    console.log(`[AlienPlanet] start player=${playerId} planet=${planetId}`);

    // Get player stats
    const playerResult = await client.query(`
      SELECT p.*, u.username, s.region
      FROM players p
      JOIN users u ON p.user_id = u.id
      JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
      WHERE p.id = $1
      FOR UPDATE OF p
    `, [playerId]);
    console.log(`[AlienPlanet] player fetched player=${playerId}`);

    if (playerResult.rows.length === 0) {
      throw new Error('Player not found');
    }

    const player = playerResult.rows[0];

    // Get alien planet stats
    // Use SKIP LOCKED to avoid waiting on contested rows - if another attack is in progress, fail fast
    const planetResult = await client.query(`
      SELECT
        ap.id,
        ap.universe_id,
        ap.sector_number,
        ap.name,
        ap.alien_race,
        ap.citadel_level,
        ap.colonists,
        ap.fighters,
        ap.fuel AS cargo_fuel,
        ap.organics AS cargo_organics,
        ap.equipment AS cargo_equipment,
        0::bigint AS credits,
        s.region
      FROM alien_planets ap
      JOIN sectors s ON s.universe_id = ap.universe_id AND s.sector_number = ap.sector_number
      WHERE ap.id = $1
      FOR UPDATE OF ap SKIP LOCKED
    `, [planetId]);
    if (planetResult.rows.length === 0) {
      console.log(`[AlienPlanet] planet fetch empty (locked or not found) planet=${planetId}`);
      throw new Error('Alien planet is currently under attack or not found. Please try again in a moment.');
    }
    console.log(`[AlienPlanet] planet fetched planet=${planetId}`);

    const planet = planetResult.rows[0];

    // Verify player is in the same sector as the planet
    if (player.current_sector !== planet.sector_number) {
      throw new Error('You must be in the same sector as the planet to attack it');
    }

    // Verify player is not in TerraSpace
    if (player.region === 'TerraSpace') {
      throw new Error('Combat is not allowed in TerraSpace');
    }

    // Verify player has fighters
    if (player.ship_fighters <= 0) {
      throw new Error('You need fighters to attack');
    }

    // Verify player has at least 1 turn
    if (player.turns_remaining < 1) {
      throw new Error('Not enough turns');
    }

    // Calculate planetary defenses
    // Citadel provides 10% defense bonus per level
    const citadelBonus = 1 + (planet.citadel_level * 0.1);
    const planetaryFighters = Math.floor(planet.fighters * citadelBonus);

    // Simulate combat
    const combatSim = simulatePlanetCombat({
      fighters: player.ship_fighters,
      shields: player.ship_shields
    }, {
      fighters: planetaryFighters,
      shields: 0, // Planets don't have shields, only citadel-boosted fighters
      citadelLevel: planet.citadel_level,
      alienRace: planet.alien_race
    });
    console.log(`[AlienPlanet] combat sim done winner=${combatSim.winner} rounds=${combatSim.rounds}`);

    combatResult.rounds = combatSim.rounds;
    combatResult.playerFightersLost = combatSim.playerFightersLost;
    combatResult.alienFightersLost = combatSim.alienFightersLost;
    combatResult.playerShieldsLost = combatSim.playerShieldsLost;
    combatResult.alienShieldsLost = combatSim.alienShieldsLost;
    combatResult.combatLog = combatSim.combatLog;
    combatResult.winner = combatSim.winner;

    const playerFightersRemaining = player.ship_fighters - combatSim.playerFightersLost;
    const playerShieldsRemaining = player.ship_shields - combatSim.playerShieldsLost;
    const planetFightersRemaining = planetaryFighters - combatSim.alienFightersLost;

    // Deduct 1 turn
    await client.query(`
      UPDATE players SET turns_remaining = turns_remaining - 1 WHERE id = $1
    `, [playerId]);
    console.log(`[AlienPlanet] turn deducted player=${playerId}`);

    if (combatSim.winner === 'player') {
      // Player victory - loot 75% of planet resources
      const fuelLooted = Math.floor(planet.cargo_fuel * 0.75);
      const organicsLooted = Math.floor(planet.cargo_organics * 0.75);
      const equipmentLooted = Math.floor(planet.cargo_equipment * 0.75);
      const creditsLooted = Math.floor((planet.credits || 0) * 0.75);

      combatResult.creditsLooted = creditsLooted;
      combatResult.alienDestroyed = true;

      // Update player with loot and remaining fighters/shields
      await client.query(`
        UPDATE players SET
          ship_fighters = $1,
          ship_shields = $2,
          credits = credits + $3,
          cargo_fuel = LEAST(cargo_fuel + $4, ship_holds_max),
          cargo_organics = LEAST(cargo_organics + $5, ship_holds_max),
          cargo_equipment = LEAST(cargo_equipment + $6, ship_holds_max),
          kills = kills + 1
        WHERE id = $7
      `, [playerFightersRemaining, playerShieldsRemaining, creditsLooted,
          fuelLooted, organicsLooted, equipmentLooted, playerId]);
      console.log(`[AlienPlanet] victory player updated player=${playerId}`);

      // Destroy the alien planet
      await client.query(`DELETE FROM alien_planets WHERE id = $1`, [planetId]);
      console.log(`[AlienPlanet] planet destroyed planet=${planetId}`);

      combatResult.message = `Victory! You destroyed the ${planet.alien_race} colony and looted ₡${creditsLooted.toLocaleString()}, ${fuelLooted} fuel, ${organicsLooted} organics, and ${equipmentLooted} equipment!`;

    } else if (combatSim.winner === 'alien') {
      // Player destroyed - apply death penalty
      const onHandCredits = parseInt(player.credits);
      const bankBalance = Number(player.bank_balance) || 0;

      const onHandLoss = Math.floor(onHandCredits * 0.25);
      const bankLoss = Math.floor(bankBalance * 0.25);

      combatResult.playerDestroyed = true;
      combatResult.creditsLooted = onHandLoss;

      // Find escape sector
      const escapeSector = await findEscapeSector(client, player.universe_id, player.current_sector);
      combatResult.playerEscapeSector = escapeSector;

      // Respawn player in escape pod
      await client.query(`
        UPDATE players SET
          ship_type = 'Escape Pod',
          ship_fighters = 0,
          ship_shields = 0,
          ship_holds_max = 5,
          ship_mines = 0,
          ship_beacons = 0,
          ship_genesis = 0,
          cargo_fuel = 0,
          cargo_organics = 0,
          cargo_equipment = 0,
          credits = credits - $1,
          deaths = deaths + 1,
          current_sector = $2
        WHERE id = $3
      `, [onHandLoss, escapeSector, playerId]);
      console.log(`[AlienPlanet] player destroyed updated player=${playerId} escape=${escapeSector}`);

      // Apply bank loss if an account exists
      if (bankLoss > 0) {
        await client.query(
          `UPDATE bank_accounts
           SET balance = GREATEST(0, balance - $1)
           WHERE player_id = $2`,
          [bankLoss, playerId]
        );
        console.log(`[AlienPlanet] bank loss applied player=${playerId}`);
      }

      // Update planet fighters (they took losses too)
      const actualPlanetFighters = Math.floor(planetFightersRemaining / citadelBonus);
      await client.query(`
        UPDATE alien_planets SET fighters = $1 WHERE id = $2
      `, [actualPlanetFighters, planetId]);
      console.log(`[AlienPlanet] planet fighters updated planet=${planetId}`);

      combatResult.message = `Defeated! The ${planet.alien_race} planetary defenses destroyed your ship. You lost ₡${(onHandLoss + bankLoss).toLocaleString()} and respawned in an escape pod.`;

    } else {
      // Draw - both sides took damage
      await client.query(`
        UPDATE players SET
          ship_fighters = $1,
          ship_shields = $2
        WHERE id = $3
      `, [playerFightersRemaining, playerShieldsRemaining, playerId]);
      console.log(`[AlienPlanet] draw player updated player=${playerId}`);

      // Update planet fighters
      const actualPlanetFighters = Math.floor(planetFightersRemaining / citadelBonus);
      await client.query(`
        UPDATE alien_planets SET fighters = $1 WHERE id = $2
      `, [actualPlanetFighters, planetId]);
      console.log(`[AlienPlanet] draw planet fighters updated planet=${planetId}`);

      combatResult.message = `Stalemate! Both forces withdrew after sustaining heavy losses.`;
    }

    await client.query('COMMIT');
    console.log(`[AlienPlanet] commit player=${playerId} planet=${planetId} winner=${combatResult.winner}`);
    combatResult.success = true;

    // Broadcast alien comms AFTER commit to avoid transaction deadlocks
    // Always broadcast alien interactions for realistic alien chatter
    try {
      const { broadcastAlienComms, broadcastTNN } = require('./broadcastService');

      if (combatSim.winner === 'player') {
        await broadcastAlienComms(player.universe_id, 'combat',
          `🔥 ${planet.alien_race} colony in Sector ${planet.sector_number} destroyed by ${player.username}!`,
          {
            alienRace: planet.alien_race,
            sectorNumber: planet.sector_number,
            relatedPlayerId: playerId,
            relatedPlanetId: planetId
          }
        );
      } else if (combatSim.winner === 'alien') {
        await broadcastAlienComms(player.universe_id, 'combat',
          `⚔️ ${planet.alien_race} colony in Sector ${planet.sector_number} repelled attack by ${player.username}`,
          {
            alienRace: planet.alien_race,
            sectorNumber: planet.sector_number,
            relatedPlayerId: playerId,
            relatedPlanetId: planetId
          }
        );

        // TNN broadcast if player was destroyed
        await broadcastTNN(
          player.universe_id,
          '💀 Ship Destroyed',
          `${player.username} (${player.corp_name}) was destroyed attacking ${planet.alien_race} colony in Sector ${planet.sector_number}`
        );
      } else {
        // Draw
        await broadcastAlienComms(player.universe_id, 'combat',
          `⚔️ ${planet.alien_race} colony in Sector ${planet.sector_number} engaged in battle with ${player.username} - both forces withdrew`,
          {
            alienRace: planet.alien_race,
            sectorNumber: planet.sector_number,
            relatedPlayerId: playerId,
            relatedPlanetId: planetId
          }
        );
      }
    } catch (broadcastError) {
      // Don't fail the whole attack if broadcast fails
      console.error('[AlienPlanet] broadcast failed:', broadcastError);
    }

    return combatResult;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[AlienPlanet] error player=${playerId} planet=${planetId}:`, error);
    // Handle lock/timeouts gracefully
    const msg = (error as any)?.message || '';
    if (msg.includes('lock timeout') || msg.includes('SKIP LOCKED') || msg.includes('canceling statement due to statement timeout')) {
      throw new Error('Alien planet is busy. Please try again in a moment.');
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Simulate combat between player and alien planet
 */
function simulatePlanetCombat(
  player: { fighters: number; shields: number },
  planet: { fighters: number; shields: number; citadelLevel: number; alienRace: string }
): Omit<AlienCombatResult, 'success' | 'creditsLooted' | 'playerEscapeSector' | 'message'> {
  let playerFighters = player.fighters;
  let playerShields = player.shields;
  let planetFighters = planet.fighters;
  let planetShields = planet.shields;

  const combatLog: Array<{
    round: number;
    playerFighters: number;
    alienFighters: number;
    playerShields: number;
    alienShields: number;
    playerDamageDealt: number;
    alienDamageDealt: number;
    description: string;
  }> = [];

  // Add initial state
  combatLog.push({
    round: 0,
    playerFighters,
    alienFighters: planetFighters,
    playerShields,
    alienShields: planetShields,
    playerDamageDealt: 0,
    alienDamageDealt: 0,
    description: `⚔️ Combat initiated against ${planet.alienRace} colony (Citadel Level ${planet.citadelLevel})`
  });

  let round = 0;
  const maxRounds = 50;

  while (round < maxRounds && playerFighters > 0 && planetFighters > 0) {
    round++;

    // Player attacks planet
    const playerDamage = Math.floor(playerFighters * (Math.random() * 0.5 + 0.75)); // 75-125% of fighters
    const initialPlanetFighters = planetFighters;
    const initialPlanetShields = planetShields;

    if (planetShields > 0) {
      const shieldDamage = Math.min(playerDamage, planetShields);
      planetShields -= shieldDamage;
      const overflow = playerDamage - shieldDamage;
      if (overflow > 0) {
        const fighterLoss = Math.floor(overflow / 10);
        planetFighters -= fighterLoss;
      }
    } else {
      const fighterLoss = Math.floor(playerDamage / 10);
      planetFighters -= fighterLoss;
    }

    if (planetFighters <= 0) {
      combatLog.push({
        round,
        playerFighters,
        alienFighters: 0,
        playerShields,
        alienShields: planetShields,
        playerDamageDealt: playerDamage,
        alienDamageDealt: 0,
        description: '🏆 All planetary defenses eliminated!'
      });
      break;
    }

    // Planet attacks player
    const planetDamage = Math.floor(planetFighters * (Math.random() * 0.5 + 0.75));

    if (playerShields > 0) {
      const shieldDamage = Math.min(planetDamage, playerShields);
      playerShields -= shieldDamage;
      const overflow = planetDamage - shieldDamage;
      if (overflow > 0) {
        const fighterLoss = Math.floor(overflow / 10);
        playerFighters -= fighterLoss;
      }
    } else {
      const fighterLoss = Math.floor(planetDamage / 10);
      playerFighters -= fighterLoss;
    }

    combatLog.push({
      round,
      playerFighters,
      alienFighters: planetFighters,
      playerShields,
      alienShields: planetShields,
      playerDamageDealt: playerDamage,
      alienDamageDealt: planetDamage,
      description: `Round ${round}: Player dealt ${playerDamage} damage, Planet dealt ${planetDamage} damage`
    });

    if (playerFighters <= 0) {
      combatLog[combatLog.length - 1].description += ' - 💀 Player ship destroyed!';
      break;
    }

    // End early if one side is destroyed
    if (playerFighters <= 0 || planetFighters <= 0) {
      break;
    }
  }

  return {
    winner: playerFighters > 0 ? (planetFighters > 0 ? 'draw' : 'player') : 'alien',
    rounds: round,
    playerFightersLost: player.fighters - playerFighters,
    alienFightersLost: planet.fighters - planetFighters,
    playerShieldsLost: player.shields - playerShields,
    alienShieldsLost: planet.shields - planetShields,
    alienDestroyed: planetFighters <= 0,
    playerDestroyed: playerFighters <= 0,
    combatLog
  };
}

/**
 * Find an escape sector for a destroyed ship
 * Returns a random adjacent sector (1-5 warps away)
 */
async function findEscapeSector(client: any, universeId: number, currentSector: number): Promise<number> {
  // Try to find an adjacent sector
  const sectorResult = await client.query(
    `SELECT s.id FROM sectors s WHERE s.universe_id = $1 AND s.sector_number = $2`,
    [universeId, currentSector]
  );

  let escapeSector = 1; // Default to Sol
  if (sectorResult.rows.length > 0) {
    const sectorId = sectorResult.rows[0].id;

    // Get all adjacent sectors (ORDER BY RANDOM() to pick a random one)
    const adjacentResult = await client.query(
      `SELECT DISTINCT destination_sector_number as sector
       FROM sector_warps
       WHERE sector_id = $1
       ORDER BY RANDOM()
       LIMIT 1`,
      [sectorId]
    );

    if (adjacentResult.rows.length > 0) {
      escapeSector = adjacentResult.rows[0].sector;
    }
  }

  return escapeSector;
}

export default {
  generateAliensForUniverse,
  getAlienShipsInSector,
  getAlienPlanetInSector,
  unlockAlienComms,
  hasAlienComms,
  getAlienCommunications,
  moveAlienShips,
  moveAllAlienShips,
  startAlienShipMovement,
  processAlienAggression,
  processAllAlienAggression,
  startAlienAggression,
  attackAlienShip
};
