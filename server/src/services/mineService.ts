import { query, getClient } from '../db/connection';
import { emitSectorEvent } from '../index';

const MAX_MINES_PER_SECTOR = 5;
const MAX_MINES_PER_SECTOR_WITH_PLANET = 8; // Increased limit if corp owns planet
const MINE_EXPLOSION_CHANCE_MIN = 0.20; // 20%
const MINE_EXPLOSION_CHANCE_MAX = 0.90; // 90%
const MINE_DAMAGE_BASE = 150; // Base damage per mine
const MINE_DAMAGE_VARIANCE = 0.5; // 50-150% variance

export interface DeployedMine {
  id: number;
  ownerId: number;
  ownerName: string;
  mineCount: number;
  deployedAt: string;
}

/**
 * Get deployed mines in a sector
 */
export const getSectorMines = async (
  universeId: number,
  sectorNumber: number
): Promise<DeployedMine[]> => {
  const result = await query(
    `SELECT id, owner_id, owner_name, mine_count, deployed_at
     FROM sector_mines
     WHERE universe_id = $1 AND sector_number = $2 AND mine_count > 0
     ORDER BY mine_count DESC`,
    [universeId, sectorNumber]
  );
  
  return result.rows.map(r => ({
    id: r.id,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    mineCount: r.mine_count,
    deployedAt: r.deployed_at
  }));
};

/**
 * Get total mines in a sector (all players combined)
 */
export const getTotalMinesInSector = async (
  universeId: number,
  sectorNumber: number
): Promise<number> => {
  const result = await query(
    `SELECT COALESCE(SUM(mine_count), 0) as total
     FROM sector_mines WHERE universe_id = $1 AND sector_number = $2`,
    [universeId, sectorNumber]
  );
  return parseInt(result.rows[0].total);
};

/**
 * Deploy mines to the current sector
 */
export const deployMines = async (
  playerId: number,
  count: number
): Promise<{ success: boolean; message: string; newShipMines?: number; deployedInSector?: number }> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    if (count <= 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Must deploy at least 1 mine' };
    }

    // Get player data
    const playerResult = await client.query(
      `SELECT id, universe_id, current_sector, ship_mines, corp_name
       FROM players WHERE id = $1 FOR UPDATE`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found' };
    }

    const player = playerResult.rows[0];

    // Check player has enough mines
    if (player.ship_mines < count) {
      await client.query('ROLLBACK');
      return { success: false, message: `You only have ${player.ship_mines} mines on your ship` };
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
      return { success: false, message: 'Cannot deploy mines in TerraSpace (safe zone)' };
    }

    // Check if player's corp owns a planet in this sector
    const planetResult = await client.query(
      `SELECT 1 FROM planets p
       JOIN players pl ON p.owner_id = pl.id
       WHERE p.sector_id = $1 AND pl.corp_name = $2`,
      [sectorResult.rows[0].sector_id, player.corp_name]
    );

    const hasPlanet = planetResult.rows.length > 0;
    const maxMines = hasPlanet ? MAX_MINES_PER_SECTOR_WITH_PLANET : MAX_MINES_PER_SECTOR;

    // Check total mines in sector
    const totalMinesResult = await client.query(
      `SELECT COALESCE(SUM(mine_count), 0) as total
       FROM sector_mines WHERE universe_id = $1 AND sector_number = $2`,
      [player.universe_id, player.current_sector]
    );
    const totalMines = parseInt(totalMinesResult.rows[0].total);

    if (totalMines + count > maxMines) {
      await client.query('ROLLBACK');
      return { success: false, message: `Maximum ${maxMines} mines per sector${hasPlanet ? ' (planet bonus)' : ''}. There are ${totalMines} mines already deployed.` };
    }

    // Check current deployment in this sector
    const existingResult = await client.query(
      `SELECT id, mine_count FROM sector_mines
       WHERE universe_id = $1 AND sector_number = $2 AND owner_id = $3`,
      [player.universe_id, player.current_sector, playerId]
    );

    let currentInSector = 0;
    if (existingResult.rows.length > 0) {
      currentInSector = existingResult.rows[0].mine_count;
    }

    // Remove mines from ship
    await client.query(
      `UPDATE players SET ship_mines = ship_mines - $1 WHERE id = $2`,
      [count, playerId]
    );

    // Add to sector (upsert)
    if (existingResult.rows.length > 0) {
      await client.query(
        `UPDATE sector_mines SET mine_count = mine_count + $1 WHERE id = $2`,
        [count, existingResult.rows[0].id]
      );
    } else {
      await client.query(
        `INSERT INTO sector_mines (universe_id, sector_number, owner_id, owner_name, mine_count)
         VALUES ($1, $2, $3, $4, $5)`,
        [player.universe_id, player.current_sector, playerId, player.corp_name, count]
      );
    }

    // Update the sectors table mines_count field
    await client.query(
      `UPDATE sectors SET mines_count = (
        SELECT COALESCE(SUM(mine_count), 0) FROM sector_mines
        WHERE universe_id = $1 AND sector_number = $2
      )
      WHERE universe_id = $1 AND sector_number = $2`,
      [player.universe_id, player.current_sector]
    );

    await client.query('COMMIT');

    // Emit event to sector
    emitSectorEvent(player.universe_id, player.current_sector, 'mines_deployed', {
      ownerName: player.corp_name,
      count,
      totalInSector: totalMines + count
    });

    return {
      success: true,
      message: `Deployed ${count} mines in Sector ${player.current_sector}`,
      newShipMines: player.ship_mines - count,
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
 * Check for mines when a player enters a sector and trigger explosions
 * Returns damage dealt to the player
 */
export const checkMinesOnEntry = async (
  playerId: number,
  universeId: number,
  sectorNumber: number
): Promise<{
  triggered: boolean;
  totalDamage: number;
  shieldsLost: number;
  fightersLost: number;
  minesDestroyed: number;
  message: string;
}> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get player data
    const playerResult = await client.query(
      `SELECT id, corp_name, ship_shields, ship_fighters
       FROM players WHERE id = $1 FOR UPDATE`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { triggered: false, totalDamage: 0, shieldsLost: 0, fightersLost: 0, minesDestroyed: 0, message: '' };
    }

    const player = playerResult.rows[0];

    // Get all mines in sector (excluding player's own corp)
    const minesResult = await client.query(
      `SELECT sm.id, sm.owner_id, sm.owner_name, sm.mine_count
       FROM sector_mines sm
       JOIN players p ON sm.owner_id = p.id
       WHERE sm.universe_id = $1 AND sm.sector_number = $2 AND p.corp_name != $3 AND sm.mine_count > 0`,
      [universeId, sectorNumber, player.corp_name]
    );

    if (minesResult.rows.length === 0) {
      await client.query('COMMIT');
      return { triggered: false, totalDamage: 0, shieldsLost: 0, fightersLost: 0, minesDestroyed: 0, message: '' };
    }

    let totalDamage = 0;
    let shieldsLost = 0;
    let fightersLost = 0;
    let totalMinesDestroyed = 0;
    const triggeredMines: Array<{ ownerName: string; count: number; mineId: number }> = [];

    // Process each mine deployment
    for (const mine of minesResult.rows) {
      const mineCount = mine.mine_count;
      let minesDestroyedForThisDeployment = 0;
      
      // Each mine has 20-90% chance to explode
      for (let i = 0; i < mineCount; i++) {
        const explosionChance = MINE_EXPLOSION_CHANCE_MIN + 
          Math.random() * (MINE_EXPLOSION_CHANCE_MAX - MINE_EXPLOSION_CHANCE_MIN);
        
        if (Math.random() < explosionChance) {
          // Mine explodes - calculate damage
          const damageMultiplier = 0.5 + Math.random(); // 50-150% variance
          const damage = Math.floor(MINE_DAMAGE_BASE * damageMultiplier);
          totalDamage += damage;
          minesDestroyedForThisDeployment++;
          totalMinesDestroyed++;
        }
      }

      if (minesDestroyedForThisDeployment > 0) {
        triggeredMines.push({
          ownerName: mine.owner_name,
          count: minesDestroyedForThisDeployment,
          mineId: mine.id
        });
      }
    }

    if (totalDamage === 0) {
      await client.query('COMMIT');
      return { 
        triggered: true, 
        totalDamage: 0, 
        shieldsLost: 0, 
        fightersLost: 0, 
        minesDestroyed: 0,
        message: '⚠️ Mines detected but none exploded!' 
      };
    }

    const minesDestroyed = totalMinesDestroyed;

    // Apply damage (shields first, then fighters)
    let remainingDamage = totalDamage;
    let currentShields = player.ship_shields;
    let currentFighters = player.ship_fighters;

    // Shields absorb damage (each shield point absorbs 2 damage)
    const shieldAbsorb = Math.min(currentShields * 2, remainingDamage);
    shieldsLost = Math.ceil(shieldAbsorb / 2);
    currentShields = Math.max(0, currentShields - shieldsLost);
    remainingDamage -= shieldAbsorb;

    // Remaining damage goes to fighters
    fightersLost = Math.min(currentFighters, remainingDamage);
    currentFighters = Math.max(0, currentFighters - fightersLost);

    // Check if player was destroyed
    // If player had no defenses (shields + fighters = 0) and took damage, they're destroyed
    const hadNoDefenses = (player.ship_shields + player.ship_fighters) === 0;
    const playerDestroyed = currentFighters <= 0 && (hadNoDefenses ? totalDamage > 0 : true);

    // Update player - convert to escape pod if destroyed
    if (playerDestroyed) {
      // Find escape sector
      const adjacentResult = await client.query(
        `SELECT s2.sector_number as sector
         FROM sectors s1
         JOIN sector_warps sw ON (sw.sector_a = s1.sector_number OR sw.sector_b = s1.sector_number) AND sw.universe_id = s1.universe_id
         JOIN sectors s2 ON ((s2.sector_number = sw.sector_a OR s2.sector_number = sw.sector_b) AND s2.sector_number != s1.sector_number) AND s2.universe_id = s1.universe_id
         WHERE s1.universe_id = $1 AND s1.sector_number = $2
         ORDER BY RANDOM()
         LIMIT 1`,
        [universeId, sectorNumber]
      );

      let escapeSector = 1; // Default to sector 1 if no adjacent sectors found
      if (adjacentResult.rows.length > 0) {
        escapeSector = adjacentResult.rows[0].sector;
      }

      await client.query(
        `UPDATE players SET
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
          current_sector = $1,
          in_escape_pod = TRUE,
          deaths = deaths + 1
         WHERE id = $2`,
        [escapeSector, playerId]
      );
    } else {
      // Just update shields and fighters
      await client.query(
        `UPDATE players SET ship_shields = $1, ship_fighters = $2 WHERE id = $3`,
        [currentShields, currentFighters, playerId]
      );
    }

    // Remove destroyed mines from sector
    for (const triggered of triggeredMines) {
      const mine = minesResult.rows.find(m => m.id === triggered.mineId);
      if (mine) {
        const remaining = mine.mine_count - triggered.count;
        if (remaining <= 0) {
          await client.query(`DELETE FROM sector_mines WHERE id = $1`, [mine.id]);
        } else {
          await client.query(
            `UPDATE sector_mines SET mine_count = $1 WHERE id = $2`,
            [remaining, mine.id]
          );
        }
      }
    }

    // Update the sectors table mines_count field
    await client.query(
      `UPDATE sectors SET mines_count = (
        SELECT COALESCE(SUM(mine_count), 0) FROM sector_mines
        WHERE universe_id = $1 AND sector_number = $2
      )
      WHERE universe_id = $1 AND sector_number = $2`,
      [universeId, sectorNumber]
    );

    await client.query('COMMIT');

    // Broadcast TNN if player was destroyed by mines
    if (playerDestroyed) {
      const { broadcastTNN } = require('./broadcastService');
      const mineOwnersList = [...new Set(triggeredMines.map(m => m.ownerName))].join(', ');
      await broadcastTNN(
        universeId,
        '💥 Ship Destroyed by Mines',
        `${player.username} (${player.corp_name}) was destroyed by a minefield in Sector ${sectorNumber}! Mines deployed by: ${mineOwnersList}`
      );
    }

    // Emit event to sector (visible to all players in sector)
    const uniqueMineOwners = triggeredMines.map(m => m.ownerName).filter((v, i, a) => a.indexOf(v) === i).join(', ');
    emitSectorEvent(universeId, sectorNumber, 'mines_exploded', {
      playerName: player.corp_name,
      mineOwners: uniqueMineOwners,
      totalDamage,
      shieldsLost,
      fightersLost,
      minesDestroyed,
      playerDestroyed,
      message: `💥 ${player.corp_name} triggered ${minesDestroyed} mines! Lost ${shieldsLost} shields, ${fightersLost} fighters${playerDestroyed ? ' - SHIP DESTROYED!' : ''}`
    });

    const mineOwners = triggeredMines.map(m => `${m.ownerName} (${m.count})`).join(', ');
    const message = triggeredMines.length > 0
      ? `💥 MINEFIELD DETONATED! ${minesDestroyed} mines exploded! Lost ${shieldsLost} shields, ${fightersLost} fighters. Mines by: ${mineOwners}`
      : `💥 MINEFIELD DETONATED! ${minesDestroyed} mines exploded! Lost ${shieldsLost} shields, ${fightersLost} fighters.`;

    return {
      triggered: true,
      totalDamage,
      shieldsLost,
      fightersLost,
      minesDestroyed,
      message
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get mine info for a player (current count, max capacity, price)
 */
export const getMineInfo = async (playerId: number): Promise<{
  price: number;
  currentCount: number;
  maxCapacity: number;
}> => {
  const result = await query(
    `SELECT p.ship_mines, st.mines_max
     FROM players p
     JOIN ship_types st ON LOWER(st.name) = LOWER(p.ship_type) AND (st.universe_id = p.universe_id OR st.universe_id IS NULL)
     WHERE p.id = $1`,
    [playerId]
  );

  if (result.rows.length === 0) {
    throw new Error('Player not found');
  }

  const row = result.rows[0];
  const price = 10000; // Base price per mine (reduced from 50000 for better balance)

  return {
    price,
    currentCount: row.ship_mines || 0,
    maxCapacity: row.mines_max || 0
  };
};

/**
 * Check for mines when an alien ship enters a sector and trigger explosions
 * Returns damage dealt to the alien ship
 */
export const checkMinesOnAlienEntry = async (
  alienShipId: number,
  universeId: number,
  sectorNumber: number
): Promise<{
  triggered: boolean;
  totalDamage: number;
  shieldsLost: number;
  fightersLost: number;
  minesDestroyed: number;
  message: string;
}> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get alien ship data
    const alienResult = await client.query(
      `SELECT id, ship_name, alien_race, fighters, shields
       FROM alien_ships WHERE id = $1 FOR UPDATE`,
      [alienShipId]
    );

    if (alienResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { triggered: false, totalDamage: 0, shieldsLost: 0, fightersLost: 0, minesDestroyed: 0, message: '' };
    }

    const alien = alienResult.rows[0];

    // Get all mines in sector (aliens trigger ALL mines, regardless of owner)
    const minesResult = await client.query(
      `SELECT sm.id, sm.owner_id, sm.owner_name, sm.mine_count
       FROM sector_mines sm
       WHERE sm.universe_id = $1 AND sm.sector_number = $2 AND sm.mine_count > 0`,
      [universeId, sectorNumber]
    );

    if (minesResult.rows.length === 0) {
      await client.query('COMMIT');
      return { triggered: false, totalDamage: 0, shieldsLost: 0, fightersLost: 0, minesDestroyed: 0, message: '' };
    }

    let totalDamage = 0;
    let totalMinesDestroyed = 0;

    // Process each mine deployment
    for (const mine of minesResult.rows) {
      const mineCount = mine.mine_count;
      let minesDestroyedForThisDeployment = 0;

      // Each mine has 20-90% chance to explode
      for (let i = 0; i < mineCount; i++) {
        const explosionChance = MINE_EXPLOSION_CHANCE_MIN +
          Math.random() * (MINE_EXPLOSION_CHANCE_MAX - MINE_EXPLOSION_CHANCE_MIN);

        if (Math.random() < explosionChance) {
          // Mine explodes - calculate damage
          const damageMultiplier = 0.5 + Math.random(); // 50-150% variance
          const damage = Math.floor(MINE_DAMAGE_BASE * damageMultiplier);
          totalDamage += damage;
          minesDestroyedForThisDeployment++;
          totalMinesDestroyed++;
        }
      }

      // Update mine count for this deployment
      if (minesDestroyedForThisDeployment > 0) {
        const newMineCount = mineCount - minesDestroyedForThisDeployment;

        if (newMineCount > 0) {
          await client.query(
            `UPDATE sector_mines SET mine_count = $1 WHERE id = $2`,
            [newMineCount, mine.id]
          );
        } else {
          await client.query(`DELETE FROM sector_mines WHERE id = $1`, [mine.id]);
        }
      }
    }

    if (totalDamage === 0) {
      await client.query('COMMIT');
      return {
        triggered: true,
        totalDamage: 0,
        shieldsLost: 0,
        fightersLost: 0,
        minesDestroyed: 0,
        message: 'Mines detected but none exploded'
      };
    }

    // Apply damage to alien ship (shields first, then fighters)
    let shieldsLost = 0;
    let fightersLost = 0;
    let remainingDamage = totalDamage;

    if (alien.shields > 0) {
      shieldsLost = Math.min(alien.shields, remainingDamage);
      remainingDamage -= shieldsLost;
    }

    if (remainingDamage > 0 && alien.fighters > 0) {
      fightersLost = Math.min(alien.fighters, remainingDamage);
    }

    // Update the sectors table mines_count field
    await client.query(
      `UPDATE sectors SET mines_count = (
        SELECT COALESCE(SUM(mine_count), 0) FROM sector_mines
        WHERE universe_id = $1 AND sector_number = $2
      )
      WHERE universe_id = $1 AND sector_number = $2`,
      [universeId, sectorNumber]
    );

    await client.query('COMMIT');

    return {
      triggered: true,
      totalDamage,
      shieldsLost,
      fightersLost,
      minesDestroyed: totalMinesDestroyed,
      message: `${totalMinesDestroyed} mines exploded for ${totalDamage} damage!`
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

