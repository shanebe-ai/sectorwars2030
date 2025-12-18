import { Request, Response } from 'express';
import {
  getTestPool,
  cleanupTestDb,
  createTestUser,
  createTestUniverse,
  createTestSector,
  createWarp,
  createTestPlayerDetailed,
  getPlayer,
  closeTestPool,
} from './helpers/testDb';

// Mock the database connection module before importing controllers
const testPool = getTestPool();
jest.mock('../db/connection', () => ({
  pool: testPool,
  query: testPool.query.bind(testPool),
  getClient: () => testPool.connect(),
}));

// Mock the server index to avoid circular dependencies
jest.mock('../index', () => ({
  emitSectorEvent: jest.fn(),
}));

// Import controllers after mocking
import { moveToSector, getSectorDetails } from '../controllers/sectorController';

describe('Sector Navigation and Turn Consumption', () => {
  let testUserId: number;
  let testUniverseId: number;
  let testPlayerId: number;
  let sector1Id: number;
  let sector2Id: number;
  let sector3Id: number;
  let testPool: any;

  beforeAll(async () => {
    testPool = getTestPool();
    // Clean up any existing test data
    await cleanupTestDb();
    
    // Create test data
    testUserId = await createTestUser('test_nav_user');
    testUniverseId = await createTestUniverse('Navigation Test Universe', 10);
    
    // Create sectors
    sector1Id = await createTestSector(testUniverseId, 1, 'Sector Alpha');
    sector2Id = await createTestSector(testUniverseId, 2, 'Sector Beta');
    sector3Id = await createTestSector(testUniverseId, 3, 'Sector Gamma');
    
    // Create warps: 1 <-> 2, 2 <-> 3
    await createWarp(sector1Id, 2, true);
    await createWarp(sector2Id, 1, true);
    await createWarp(sector2Id, 3, true);
    await createWarp(sector3Id, 2, true);
    
    // Create player starting in sector 1 with 50 turns
    testPlayerId = await createTestPlayerDetailed(
      testUserId,
      testUniverseId,
      1,
      50,
      'Navigation Test Corp'
    );
  });

  afterAll(async () => {
    await cleanupTestDb();
    await closeTestPool();
  });

  beforeEach(async () => {
    // Reset player to sector 1 with 50 turns before each test
    await testPool.query(
      `UPDATE players SET current_sector = 1, turns_remaining = 50 WHERE id = $1`,
      [testPlayerId]
    );
  });

  describe('moveToSector - Successful Navigation', () => {
    it('should successfully move player to connected sector and consume 1 turn', async () => {
      const req = {
        body: { destinationSector: 2 },
        user: { userId: testUserId },
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      // Get initial player state
      const playerBefore = await getPlayer(testPlayerId);
      expect(playerBefore.current_sector).toBe(1);
      expect(playerBefore.turns_remaining).toBe(50);

      await moveToSector(req, res);

      // Verify response
      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(res.status).not.toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          player: expect.objectContaining({
            currentSector: 2,
            turnsRemaining: 49, // 50 - 1
          }),
          turnCost: 1,
        })
      );

      // Verify database state
      const playerAfter = await getPlayer(testPlayerId);
      expect(playerAfter.current_sector).toBe(2);
      expect(playerAfter.turns_remaining).toBe(49);
    });

    it('should verify player location is updated correctly after multiple moves', async () => {
      // Set player to sector 1 with 30 turns
      await testPool.query(
        `UPDATE players SET current_sector = 1, turns_remaining = 30 WHERE id = $1`,
        [testPlayerId]
      );

      const req1 = {
        body: { destinationSector: 2 },
        user: { userId: testUserId },
      } as any;

      const res1 = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await moveToSector(req1, res1);

      expect(res1.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          player: expect.objectContaining({
            currentSector: 2,
            turnsRemaining: 29,
          }),
        })
      );

      // Move again from sector 2 to sector 3
      const req2 = {
        body: { destinationSector: 3 },
        user: { userId: testUserId },
      } as any;

      const res2 = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await moveToSector(req2, res2);

      expect(res2.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          player: expect.objectContaining({
            currentSector: 3,
            turnsRemaining: 28, // 29 - 1
          }),
        })
      );

      // Verify final state
      const playerFinal = await getPlayer(testPlayerId);
      expect(playerFinal.current_sector).toBe(3);
      expect(playerFinal.turns_remaining).toBe(28);
    });
  });

  describe('moveToSector - Turn Consumption', () => {
    it('should reject movement when player has 0 turns', async () => {
      // Set player to 0 turns
      await testPool.query(
        `UPDATE players SET turns_remaining = 0 WHERE id = $1`,
        [testPlayerId]
      );

      const req = {
        body: { destinationSector: 2 },
        user: { userId: testUserId },
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await moveToSector(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Not enough turns remaining',
      });

      // Verify player state didn't change
      const player = await getPlayer(testPlayerId);
      expect(player.current_sector).toBe(1);
      expect(player.turns_remaining).toBe(0);
    });

    it('should consume exactly 1 turn per movement', async () => {
      // Set player to sector 1 with 10 turns
      await testPool.query(
        `UPDATE players SET current_sector = 1, turns_remaining = 10 WHERE id = $1`,
        [testPlayerId]
      );

      const playerBefore = await getPlayer(testPlayerId);
      expect(playerBefore.turns_remaining).toBe(10);

      const req = {
        body: { destinationSector: 2 },
        user: { userId: testUserId },
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await moveToSector(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          turnCost: 1,
          player: expect.objectContaining({
            turnsRemaining: 9, // 10 - 1
          }),
        })
      );

      // Verify database state
      const playerAfter = await getPlayer(testPlayerId);
      expect(playerAfter.turns_remaining).toBe(9);
    });

    it('should consume 1 turn for each movement in sequence', async () => {
      // Set player to sector 1 with 5 turns
      await testPool.query(
        `UPDATE players SET current_sector = 1, turns_remaining = 5 WHERE id = $1`,
        [testPlayerId]
      );

      // Make 3 moves
      for (let i = 0; i < 3; i++) {
        const req = {
          body: { destinationSector: i === 0 ? 2 : (i === 1 ? 3 : 2) },
          user: { userId: testUserId },
        } as any;

        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        } as any;

        await moveToSector(req, res);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            turnCost: 1,
          })
        );
      }

      // Verify final turns: 5 - 3 = 2
      const playerFinal = await getPlayer(testPlayerId);
      expect(playerFinal.turns_remaining).toBe(2);
    });
  });

  describe('moveToSector - Validation Errors', () => {
    it('should reject movement to unconnected sector', async () => {
      const req = {
        body: { destinationSector: 999 }, // Not connected
        user: { userId: testUserId },
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await moveToSector(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'No warp connection to that sector',
      });

      // Verify player state didn't change
      const player = await getPlayer(testPlayerId);
      expect(player.current_sector).toBe(1);
      expect(player.turns_remaining).toBe(50); // Turns should not be consumed
    });

    it('should reject invalid destination sector number', async () => {
      const req = {
        body: { destinationSector: 'invalid' },
        user: { userId: testUserId },
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await moveToSector(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid destination sector',
      });
    });

    it('should reject movement when not authenticated', async () => {
      const req = {
        body: { destinationSector: 2 },
        user: null,
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await moveToSector(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
      });
    });
  });

  describe('getSectorDetails', () => {
    it('should return sector details with warps', async () => {
      const req = {
        params: { sectorNumber: '1' },
        user: { userId: testUserId },
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await getSectorDetails(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          sector: expect.objectContaining({
            sectorNumber: 1,
            warps: expect.arrayContaining([
              expect.objectContaining({
                destination: 2,
              }),
            ]),
          }),
        })
      );
    });
  });
});

