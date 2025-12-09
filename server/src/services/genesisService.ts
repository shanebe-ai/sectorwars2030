import { getClient, query } from '../db/connection';

/**
 * Genesis Torpedo Service
 * Handles purchasing and launching genesis torpedoes to create new planets
 */

interface GenesisInfo {
  currentGenesis: number;
  maxGenesis: number;
  price: number;
}

interface GenesisLaunchResult {
  success: boolean;
  message: string;
  planet?: any;
  player?: any;
}

const GENESIS_PRICE = 50000;

/**
 * Get genesis torpedo info for a player
 */
export async function getGenesisInfo(playerId: number): Promise<GenesisInfo> {
  const result = await query(
    `SELECT p.ship_genesis as current_genesis, st.ship_genesis_max as max_genesis
     FROM players p
     JOIN ship_types st ON LOWER(p.ship_type) = LOWER(st.name)
     WHERE p.id = $1`,
    [playerId]
  );

  if (result.rows.length === 0) {
    throw new Error('Player not found');
  }

  const row = result.rows[0];
  return {
    currentGenesis: row.current_genesis,
    maxGenesis: row.max_genesis,
    price: GENESIS_PRICE
  };
}

/**
 * Purchase genesis torpedoes at StarDock
 */
export async function purchaseGenesis(playerId: number, quantity: number): Promise<GenesisLaunchResult> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get player and ship info
    const playerResult = await client.query(
      `SELECT p.*, st.ship_genesis_max
       FROM players p
       JOIN ship_types st ON LOWER(p.ship_type) = LOWER(st.name)
       WHERE p.id = $1
       FOR UPDATE OF p`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found' };
    }

    const player = playerResult.rows[0];

    // Validate quantity
    if (quantity <= 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Invalid quantity' };
    }

    // Check if at StarDock
    const stardockCheck = await client.query(
      `SELECT id FROM ports
       WHERE sector_number = $1
       AND universe_id = $2
       AND port_type = 'STARDOCK'`,
      [player.current_sector, player.universe_id]
    );

    if (stardockCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Must be at a StarDock to purchase genesis torpedoes' };
    }

    // Check capacity
    const spaceAvailable = player.ship_genesis_max - player.ship_genesis;
    if (spaceAvailable <= 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Your ship cannot carry any more genesis torpedoes' };
    }

    if (quantity > spaceAvailable) {
      await client.query('ROLLBACK');
      return { success: false, message: `Your ship can only hold ${spaceAvailable} more genesis torpedoes` };
    }

    // Check credits
    const totalCost = GENESIS_PRICE * quantity;
    if (player.credits < totalCost) {
      await client.query('ROLLBACK');
      return { success: false, message: `Insufficient credits. Need ₡${totalCost.toLocaleString()}` };
    }

    // Deduct credits and add genesis torpedoes
    const updateResult = await client.query(
      `UPDATE players
       SET credits = credits - $1, ship_genesis = ship_genesis + $2
       WHERE id = $3
       RETURNING *`,
      [totalCost, quantity, playerId]
    );

    await client.query('COMMIT');

    return {
      success: true,
      message: `Purchased ${quantity} genesis torpedo${quantity > 1 ? 'es' : ''} for ₡${totalCost.toLocaleString()}`,
      player: updateResult.rows[0]
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Launch a genesis torpedo to create a new planet
 */
export async function launchGenesis(playerId: number): Promise<GenesisLaunchResult> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get player info
    const playerResult = await client.query(
      `SELECT p.* FROM players p WHERE p.id = $1 FOR UPDATE OF p`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found' };
    }

    const player = playerResult.rows[0];

    // Validate player has genesis torpedo
    if (player.ship_genesis <= 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'No genesis torpedoes available' };
    }

    // Validate player has turns
    if (player.turns_remaining <= 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Insufficient turns' };
    }

    // Validate player is not in escape pod
    if (player.in_escape_pod) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Cannot launch genesis torpedoes while in escape pod' };
    }

    // Check if in TerraSpace (sectors 1-10)
    if (player.current_sector >= 1 && player.current_sector <= 10) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Cannot launch genesis torpedoes in TerraSpace (sectors 1-10)' };
    }

    // Check if sector already has a planet
    const existingPlanetCheck = await client.query(
      `SELECT id FROM planets
       WHERE sector_number = $1 AND universe_id = $2`,
      [player.current_sector, player.universe_id]
    );

    if (existingPlanetCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'This sector already has a planet' };
    }

    // Check if sector has a port
    const portCheck = await client.query(
      `SELECT id FROM ports
       WHERE sector_number = $1 AND universe_id = $2`,
      [player.current_sector, player.universe_id]
    );

    if (portCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Cannot create planets in port sectors' };
    }

    // Generate planet name
    const prefixes = ['New', 'Nova', 'Genesis', 'Frontier', 'Haven', 'Outpost', 'Colony'];
    const suffixes = ['Prime', 'Station', 'World', 'Base', 'Reach', 'Landing', 'Point'];
    const planetName = `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${suffixes[Math.floor(Math.random() * suffixes.length)]}`;

    // Create the planet (unclaimed, no owner)
    const planetResult = await client.query(
      `INSERT INTO planets (
        universe_id, sector_number, name, owner_id, owner_name,
        citadel_level, fighters, credits,
        fuel, organics, equipment, colonists,
        production_type
      ) VALUES ($1, $2, $3, NULL, NULL, 0, 0, 0, 0, 0, 0, 0, 'balanced')
      RETURNING *`,
      [player.universe_id, player.current_sector, planetName]
    );

    const planet = planetResult.rows[0];

    // Deduct genesis torpedo and turn
    const updateResult = await client.query(
      `UPDATE players
       SET ship_genesis = ship_genesis - 1,
           turns_remaining = turns_remaining - 1
       WHERE id = $1
       RETURNING *`,
      [playerId]
    );

    await client.query('COMMIT');

    // Broadcast TNN announcement
    try {
      const { broadcastTNN } = require('./broadcastService');
      const userResult = await query('SELECT username FROM users WHERE id = $1', [player.user_id]);
      const username = userResult.rows[0]?.username || 'Unknown';

      await broadcastTNN(
        player.universe_id,
        '🌍 New Planet Created',
        `${username} (${player.corp_name}) has created ${planetName} in Sector ${player.current_sector} using a Genesis Torpedo!`
      );
    } catch (broadcastError) {
      console.error('[Genesis] TNN broadcast failed:', broadcastError);
    }

    return {
      success: true,
      message: `Genesis torpedo launched! Created ${planetName} in Sector ${player.current_sector}`,
      planet,
      player: updateResult.rows[0]
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
