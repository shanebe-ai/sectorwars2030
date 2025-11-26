import {
  getTestPool,
  cleanupTestDb,
  createTestUser,
  createTestUniverse,
  createTestSector,
  closeTestPool,
} from './helpers/testDb';

// Mock the database connection module before importing services
const testPool = getTestPool();
jest.mock('../db/connection', () => ({
  pool: testPool,
  query: async (text: string, params?: any[]) => testPool.query(text, params),
  getClient: () => testPool.connect(),
}));

import { createPlayer } from '../services/playerService';

describe('Player Creation - Sector Number Bug Fix', () => {
  let testUserId: number;
  let testUniverseId: number;

  beforeAll(async () => {
    await cleanupTestDb();
    
    // Create test user
    testUserId = await createTestUser('test_player_creation');
    
    // Create test universe
    testUniverseId = await createTestUniverse('Player Creation Test Universe', 100);
    
    // Create sectors with specific sector_numbers
    // The sector IDs will be auto-incremented but sector_numbers are 1-100
    for (let i = 1; i <= 10; i++) {
      await createTestSector(testUniverseId, i, `Test Sector ${i}`);
    }
  });

  afterAll(async () => {
    await cleanupTestDb();
    await closeTestPool();
  });

  it('should assign player to sector_number 1, not the database id', async () => {
    const player = await createPlayer({
      userId: testUserId,
      universeId: testUniverseId,
      corpName: 'Test Corporation',
    });

    // The player should be in sector_number 1, not the database id
    // This verifies the bug fix - previously it would assign the sector's
    // database ID which could be any number (e.g., 1151 if other universes exist)
    expect(player.current_sector).toBe(1);
    
    // Verify sector_number 1 exists and matches
    const sectorCheck = await testPool.query(
      'SELECT sector_number FROM sectors WHERE universe_id = $1 AND sector_number = $2',
      [testUniverseId, player.current_sector]
    );
    
    expect(sectorCheck.rows.length).toBe(1);
    expect(sectorCheck.rows[0].sector_number).toBe(1);
  });

  it('should allow player to navigate using sector_number', async () => {
    // Get the player we just created
    const playerResult = await testPool.query(
      'SELECT * FROM players WHERE user_id = $1 AND universe_id = $2',
      [testUserId, testUniverseId]
    );
    
    const player = playerResult.rows[0];
    
    // Verify we can look up the sector by sector_number (not id)
    const sectorResult = await testPool.query(
      `SELECT s.id, s.sector_number, s.name 
       FROM sectors s 
       WHERE s.universe_id = $1 AND s.sector_number = $2`,
      [testUniverseId, player.current_sector]
    );
    
    expect(sectorResult.rows.length).toBe(1);
    expect(sectorResult.rows[0].sector_number).toBe(player.current_sector);
    // The id might be different from sector_number
    console.log(`Sector: id=${sectorResult.rows[0].id}, sector_number=${sectorResult.rows[0].sector_number}`);
  });
});


