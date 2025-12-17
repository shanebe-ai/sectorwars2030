import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

let testPool: Pool | null = null;

/**
 * Get or create a test database connection pool
 */
export function getTestPool(): Pool {
  if (!testPool) {
    testPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'tradewars',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      max: 5,
    });
  }
  return testPool;
}

/**
 * Clean up test database - removes all test data
 */
export async function cleanupTestDb(): Promise<void> {
  const pool = getTestPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Delete in reverse order of dependencies
    await client.query('DELETE FROM game_events');
    await client.query('DELETE FROM combat_log');
    await client.query('DELETE FROM turn_updates');
    await client.query('DELETE FROM sector_warps');
    await client.query('DELETE FROM sectors');
    await client.query('DELETE FROM planets');
    await client.query('DELETE FROM corporations'); // Delete corporations before players
    await client.query('DELETE FROM players');
    await client.query('DELETE FROM universes');
    await client.query('DELETE FROM users WHERE username LIKE \'test_%\'');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Create test user and return user ID
 */
export async function createTestUser(
  username: string = `test_user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  email?: string,
  isAdmin: boolean = false
): Promise<number> {
  const pool = getTestPool();
  const client = await pool.connect();
  
  try {
    // First try to insert, ignore conflicts
    const insertResult = await client.query(
      `INSERT INTO users (username, email, password_hash, is_admin)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING
       RETURNING id`,
      [
        username,
        email || `${username}@test.com`,
        '$2b$10$dummyhashforpasswordtesting', // Dummy hash for testing
        isAdmin
      ]
    );

    if (insertResult.rows.length > 0) {
      return insertResult.rows[0].id;
    }

    // User already exists, get their ID
    const existingResult = await client.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );

    if (existingResult.rows.length === 0) {
      throw new Error(`Failed to create or find user: ${username}`);
    }

    return existingResult.rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * Clean up test data - call this at the beginning of test suites
 */
export async function cleanupTestData(): Promise<void> {
  const pool = getTestPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Delete in order to respect foreign key constraints
    await client.query('DELETE FROM player_trade_history');
    await client.query('DELETE FROM player_trade_offers');
    await client.query('DELETE FROM alien_trade_offers');
    await client.query('DELETE FROM alien_trade_history');
    await client.query('DELETE FROM sector_beacons');
    await client.query('DELETE FROM sector_fighters');
    await client.query('DELETE FROM sector_mines');
    await client.query('DELETE FROM planets');
    // Handle circular dependency between players and corporations
    await client.query('UPDATE players SET corp_id = NULL WHERE corp_id IS NOT NULL');
    await client.query('DELETE FROM corporations');
    await client.query('DELETE FROM players');
    await client.query('DELETE FROM users WHERE username LIKE \'test_%\' OR username LIKE \'p2p_%\'');

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Create test player for a user
 */
export async function createTestPlayer(userId: number, corpName: string = 'Test Corp'): Promise<number> {
  const pool = getTestPool();
  const result = await pool.query(`
    INSERT INTO players (
      user_id, universe_id, corp_name, current_sector,
      cargo_fuel, cargo_organics, cargo_equipment,
      credits, ship_type, ship_beacons
    )
    VALUES ($1, 3, $2, 10, 500, 500, 500, 5000, 'Scout', 5)
    RETURNING id
  `, [userId, corpName]);

  return result.rows[0].id;
}

/**
 * Create test universe and return universe ID
 */
export async function createTestUniverse(
  name: string = `Test Universe ${Date.now()}`,
  maxSectors: number = 100
): Promise<number> {
  const pool = getTestPool();
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `INSERT INTO universes (name, max_sectors, max_players, turns_per_day, starting_credits, starting_ship_type)
       VALUES ($1, $2, 100, 1000, 2000, 'scout')
       RETURNING id`,
      [name, maxSectors]
    );
    
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * Create test sector and return sector ID
 */
export async function createTestSector(
  universeId: number,
  sectorNumber: number,
  name?: string
): Promise<number> {
  const pool = getTestPool();
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `INSERT INTO sectors (universe_id, sector_number, name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [universeId, sectorNumber, name || `Sector ${sectorNumber}`]
    );
    
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * Create warp connection between sectors
 */
export async function createWarp(
  sectorId: number,
  destinationSectorNumber: number,
  isTwoWay: boolean = true
): Promise<void> {
  const pool = getTestPool();
  const client = await pool.connect();
  
  try {
    await client.query(
      `INSERT INTO sector_warps (sector_id, destination_sector_number, is_two_way)
       VALUES ($1, $2, $3)`,
      [sectorId, destinationSectorNumber, isTwoWay]
    );
  } finally {
    client.release();
  }
}

/**
 * Create test player with full parameters and return player ID
 */
export async function createTestPlayerDetailed(
  userId: number,
  universeId: number,
  currentSector: number,
  turnsRemaining: number = 100,
  corpName: string = 'Test Corp'
): Promise<number> {
  const pool = getTestPool();
  const client = await pool.connect();
  
  try {
    // First ensure ship type exists
    const shipTypeResult = await client.query(
      `SELECT id FROM ship_types WHERE name = 'scout' AND (universe_id IS NULL OR universe_id = $1) LIMIT 1`,
      [universeId]
    );
    
    if (shipTypeResult.rows.length === 0) {
      // Create default scout ship type with required fields
      await client.query(
        `INSERT INTO ship_types (name, universe_id, holds, fighters_max, shields_max, turns_cost, cost_credits)
         VALUES ('scout', NULL, 20, 0, 0, 1, 0)`
      );
    }
    
    const result = await client.query(
      `INSERT INTO players (
        user_id, universe_id, corp_name, current_sector, 
        credits, turns_remaining, ship_type, ship_holds_max, 
        ship_fighters, ship_shields
      )
      VALUES ($1, $2, $3, $4, 2000, $5, 'scout', 20, 0, 0)
      RETURNING id`,
      [userId, universeId, corpName, currentSector, turnsRemaining]
    );
    
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * Get player data
 */
export async function getPlayer(playerId: number): Promise<any> {
  const pool = getTestPool();
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `SELECT * FROM players WHERE id = $1`,
      [playerId]
    );
    
    return result.rows[0] || null;
  } finally {
    client.release();
  }
}

/**
 * Create test sector with StarDock
 */
export async function createTestStardockSector(
  universeId: number,
  sectorNumber: number,
  name?: string
): Promise<number> {
  const pool = getTestPool();
  const client = await pool.connect();
  
  try {
    const result = await client.query(
      `INSERT INTO sectors (universe_id, sector_number, name, port_type, port_class)
       VALUES ($1, $2, $3, 'STARDOCK', 9)
       RETURNING id`,
      [universeId, sectorNumber, name || `StarDock Sector ${sectorNumber}`]
    );
    
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * Create test player with specific credits and fighters
 */
export async function createTestPlayerWithStats(
  userId: number,
  universeId: number,
  currentSector: number,
  credits: number = 2000,
  fighters: number = 10,
  shields: number = 10,
  turnsRemaining: number = 100,
  corpName: string = 'Test Corp'
): Promise<number> {
  const pool = getTestPool();
  const client = await pool.connect();
  
  try {
    // First ensure ship type exists
    const shipTypeResult = await client.query(
      `SELECT id FROM ship_types WHERE name = 'scout' AND (universe_id IS NULL OR universe_id = $1) LIMIT 1`,
      [universeId]
    );
    
    if (shipTypeResult.rows.length === 0) {
      await client.query(
        `INSERT INTO ship_types (name, universe_id, holds, fighters_max, shields_max, turns_cost, cost_credits)
         VALUES ('scout', NULL, 20, 10, 10, 1, 10000)`
      );
    }
    
    const result = await client.query(
      `INSERT INTO players (
        user_id, universe_id, corp_name, current_sector, 
        credits, turns_remaining, ship_type, ship_holds_max, 
        ship_fighters, ship_shields
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'scout', 20, $7, $8)
      RETURNING id`,
      [userId, universeId, corpName, currentSector, credits, turnsRemaining, fighters, shields]
    );
    
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * Get bank account balance
 */
export async function getBankAccountBalance(
  playerId: number,
  accountType: 'personal' | 'corporate'
): Promise<number> {
  const pool = getTestPool();
  const client = await pool.connect();
  
  try {
    let result;
    if (accountType === 'personal') {
      result = await client.query(
        `SELECT balance FROM bank_accounts WHERE player_id = $1 AND account_type = 'personal'`,
        [playerId]
      );
    } else {
      // Get corp_id from player
      const corpResult = await client.query(
        `SELECT corp_id FROM corp_members WHERE player_id = $1`,
        [playerId]
      );
      if (corpResult.rows.length === 0) return 0;
      result = await client.query(
        `SELECT balance FROM bank_accounts WHERE corp_id = $1 AND account_type = 'corporate'`,
        [corpResult.rows[0].corp_id]
      );
    }
    
    if (result.rows.length === 0) return 0;
    return parseInt(String(result.rows[0].balance), 10) || 0;
  } finally {
    client.release();
  }
}

/**
 * Close test database pool
 */
export async function closeTestPool(): Promise<void> {
  if (testPool) {
    await testPool.end();
    testPool = null;
  }
}

