import { query, getClient } from '../db/connection';
import { recordEncounter } from './messageService';
import { Player } from '../../../shared/types';

interface CreatePlayerParams {
  userId: number;
  universeId: number;
  corpName: string;
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

    // Find Sol sector (sector 1) or first sector by sector_number if not found
    const sectorResult = await client.query(
      'SELECT sector_number FROM sectors WHERE universe_id = $1 ORDER BY sector_number LIMIT 1',
      [universeId]
    );

    if (sectorResult.rows.length === 0) {
      throw new Error('No sectors found in universe');
    }

    // Use sector_number (1-N), NOT the database id (which is unique across all universes)
    const startingSector = sectorResult.rows[0].sector_number;

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

    const newPlayer = playerResult.rows[0];

    // Create a personal corporation for the player
    const corpResult = await client.query(
      `INSERT INTO corporations (universe_id, name, founder_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [universeId, corpName, newPlayer.id]
    );

    const corpId = corpResult.rows[0].id;

    // Update player with corp_id
    await client.query(
      `UPDATE players SET corp_id = $1 WHERE id = $2`,
      [corpId, newPlayer.id]
    );

    // Add player as founder of their corporation
    await client.query(
      `INSERT INTO corp_members (corp_id, player_id, rank)
       VALUES ($1, $2, 'founder')`,
      [corpId, newPlayer.id]
    );

    // Get other players in the starting sector BEFORE committing
    const otherPlayersResult = await client.query(
      `SELECT id FROM players
       WHERE universe_id = $1 AND current_sector = $2 AND id != $3 AND is_alive = true`,
      [universeId, startingSector, newPlayer.id]
    );

    await client.query('COMMIT');

    console.log(`Player created: ${corpName} in universe ${universeId} with corporation ID ${corpId}`);

    // Update the newPlayer object with corp_id before returning
    newPlayer.corp_id = corpId;

    // Record encounters AFTER commit so new player is visible to other connections
    for (const otherPlayer of otherPlayersResult.rows) {
      await recordEncounter(newPlayer.id, otherPlayer.id, universeId);
      await recordEncounter(otherPlayer.id, newPlayer.id, universeId);
    }

    // Broadcast TNN welcome message for new player
    try {
      const { broadcastTNN } = require('./broadcastService');
      const userResult = await query('SELECT username FROM users WHERE id = $1', [userId]);
      const username = userResult.rows[0]?.username || 'Unknown';

      await broadcastTNN(
        universeId,
        '🌟 New Commander Arrives',
        `Welcome ${username} to the universe! Commander of ${corpName}, piloting a ${universe.starting_ship_type} in Sector ${startingSector}.`
      );
    } catch (broadcastError) {
      console.error('[PlayerCreation] TNN broadcast failed:', broadcastError);
    }

    return newPlayer;
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Player creation error:', error.message);
    console.error('Error code:', error.code);
    console.error('Error detail:', error.detail);
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

/**
 * Regenerate turns for a player based on time elapsed
 * Turns regenerate gradually throughout the day based on universe's turns_per_day setting
 * Returns the updated player with new turn count
 */
export const regenerateTurns = async (playerId: number): Promise<Player | null> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get player with universe settings
    const playerResult = await client.query(
      `SELECT p.*, u.turns_per_day
       FROM players p
       JOIN universes u ON p.universe_id = u.id
       WHERE p.id = $1`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const player = playerResult.rows[0];
    const turnsPerDay = player.turns_per_day || 1000;
    const lastUpdate = new Date(player.last_turn_update);
    const now = new Date();

    // Calculate hours elapsed since last update
    const msElapsed = now.getTime() - lastUpdate.getTime();
    const hoursElapsed = msElapsed / (1000 * 60 * 60);

    // Calculate turns to add (turns regenerate evenly throughout the day)
    const turnsPerHour = turnsPerDay / 24;
    const turnsToAdd = Math.floor(hoursElapsed * turnsPerHour);

    // Only update if there are turns to add
    if (turnsToAdd > 0) {
      // Cap at turns_per_day (can't exceed max)
      const newTurns = Math.min(player.turns_remaining + turnsToAdd, turnsPerDay);

      // Update player turns and last_turn_update
      const updateResult = await client.query(
        `UPDATE players
         SET turns_remaining = $1, last_turn_update = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [newTurns, playerId]
      );

      await client.query('COMMIT');

      console.log(
        `Regenerated ${turnsToAdd} turns for player ${playerId} (${player.turns_remaining} → ${newTurns})`
      );

      return updateResult.rows[0];
    }

    await client.query('COMMIT');
    return player;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get player by ID with turn regeneration
 * Automatically regenerates turns based on time elapsed
 */
export const getPlayerByIdWithTurns = async (playerId: number): Promise<Player | null> => {
  // First regenerate turns
  const player = await regenerateTurns(playerId);
  return player;
};
