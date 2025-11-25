import { query, getClient } from '../db/connection';

interface CreatePlayerParams {
  userId: number;
  universeId: number;
  corpName: string;
}

interface Player {
  id: number;
  user_id: number;
  universe_id: number;
  corp_name: string;
  current_sector: number;
  credits: number;
  turns_remaining: number;
  experience: number;
  alignment: number;
  ship_type: string;
  ship_holds_max: number;
  ship_fighters: number;
  ship_shields: number;
  ship_torpedoes: number;
  ship_mines: number;
  ship_beacons: number;
  cargo_fuel: number;
  cargo_organics: number;
  cargo_equipment: number;
  is_alive: boolean;
  last_turn_update: Date;
  created_at: Date;
}

/**
 * Create a new player in a universe
 * Assigns starting ship, credits, and places them in Sol (sector 1)
 */
export const createPlayer = async ({
  userId,
  universeId,
  corpName,
}: CreatePlayerParams): Promise<Player> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get universe configuration
    const universeResult = await client.query(
      'SELECT starting_credits, starting_ship_type, max_players FROM universes WHERE id = $1',
      [universeId]
    );

    if (universeResult.rows.length === 0) {
      throw new Error('Universe not found');
    }

    const universe = universeResult.rows[0];

    // Check if universe is full
    const playerCountResult = await client.query(
      'SELECT COUNT(*) as count FROM players WHERE universe_id = $1 AND is_alive = TRUE',
      [universeId]
    );

    const currentPlayers = parseInt(playerCountResult.rows[0].count);
    if (currentPlayers >= universe.max_players) {
      throw new Error('Universe is full');
    }

    // Check if player already exists in this universe
    const existingResult = await client.query(
      'SELECT id FROM players WHERE user_id = $1 AND universe_id = $2',
      [userId, universeId]
    );

    if (existingResult.rows.length > 0) {
      throw new Error('Player already exists in this universe');
    }

    // Get ship type stats (look for universe-specific or global ship types)
    const shipResult = await client.query(
      `SELECT holds, fighters_max, shields_max FROM ship_types
       WHERE LOWER(name) = LOWER($1)
       AND (universe_id = $2 OR universe_id IS NULL)
       LIMIT 1`,
      [universe.starting_ship_type, universeId]
    );

    if (shipResult.rows.length === 0) {
      throw new Error('Starting ship type not found');
    }

    const ship = shipResult.rows[0];

    // Find Sol sector (sector 1) or first sector if not found
    const sectorResult = await client.query(
      'SELECT id FROM sectors WHERE universe_id = $1 ORDER BY id LIMIT 1',
      [universeId]
    );

    if (sectorResult.rows.length === 0) {
      throw new Error('No sectors found in universe');
    }

    const startingSector = sectorResult.rows[0].id;

    // Create the player
    const playerResult = await client.query(
      `INSERT INTO players (
        user_id, universe_id, corp_name, current_sector,
        credits, turns_remaining, ship_type, ship_holds_max,
        ship_fighters, ship_shields
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        userId,
        universeId,
        corpName,
        startingSector,
        universe.starting_credits,
        1000, // Default turns per day
        universe.starting_ship_type,
        ship.holds,
        ship.fighters_max,
        ship.shields_max,
      ]
    );

    await client.query('COMMIT');

    console.log(`Player created: ${corpName} in universe ${universeId}`);

    return playerResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get player by user ID and universe ID
 */
export const getPlayerByUserAndUniverse = async (
  userId: number,
  universeId: number
): Promise<Player | null> => {
  const result = await query(
    'SELECT * FROM players WHERE user_id = $1 AND universe_id = $2',
    [userId, universeId]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Get all players for a user across all universes
 */
export const getPlayersByUser = async (userId: number): Promise<Player[]> => {
  const result = await query(
    `SELECT p.*, u.name as universe_name
     FROM players p
     JOIN universes u ON p.universe_id = u.id
     WHERE p.user_id = $1
     ORDER BY p.created_at DESC`,
    [userId]
  );

  return result.rows;
};

/**
 * Get player by ID with full details
 */
export const getPlayerById = async (playerId: number): Promise<Player | null> => {
  const result = await query('SELECT * FROM players WHERE id = $1', [playerId]);

  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Check if user has a player in a specific universe
 */
export const hasPlayerInUniverse = async (
  userId: number,
  universeId: number
): Promise<boolean> => {
  const result = await query(
    'SELECT id FROM players WHERE user_id = $1 AND universe_id = $2',
    [userId, universeId]
  );

  return result.rows.length > 0;
};
