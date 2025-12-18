import { Request, Response } from 'express';
import {
  getTestPool,
  cleanupTestDb,
  createTestUser,
  createTestUniverse,
  createTestSector,
  createTestPlayerWithStats,
  getPlayer,
  getBankAccountBalance,
  closeTestPool,
} from './helpers/testDb';

// Mock the database connection module before importing services
const testPool = getTestPool();
jest.mock('../db/connection', () => {
  const actualModule = jest.requireActual('../db/connection');
  return {
    ...actualModule,
    pool: testPool,
    getClient: () => testPool.connect(),
    query: testPool.query.bind(testPool),
  };
});

// Mock WebSocket events
jest.mock('../index', () => ({
  emitSectorEvent: jest.fn(),
  emitUniverseEvent: jest.fn(),
  emitPlayerEvent: jest.fn(),
}));

// Import services after mocking
import * as combatService from '../services/combatService';

describe('Combat System - Economy Rebalancing', () => {
  let attackerUserId: number;
  let defenderUserId: number;
  let testUniverseId: number;
  let attackerPlayerId: number;
  let defenderPlayerId: number;
  let combatSectorId: number;
  let testPool: any;

  beforeAll(async () => {
    testPool = getTestPool();
    await cleanupTestDb();
    
    attackerUserId = await createTestUser('test_attacker');
    defenderUserId = await createTestUser('test_defender');
    testUniverseId = await createTestUniverse('Combat Test Universe', 10);
    
    // Create sectors outside TerraSpace (sectors 11 and 12)
    combatSectorId = await createTestSector(testUniverseId, 11, 'Combat Sector');
    const escapeSectorId = await createTestSector(testUniverseId, 12, 'Escape Sector');
    await testPool.query(
      `UPDATE sectors SET region = 'Deep Space' WHERE id IN ($1, $2)`,
      [combatSectorId, escapeSectorId]
    );
    
    // Create warp connection for escape pods
    await testPool.query(
      `INSERT INTO sector_warps (sector_id, destination_sector_number, is_two_way)
       VALUES ($1, 12, true), ($2, 11, true)
       ON CONFLICT DO NOTHING`,
      [combatSectorId, escapeSectorId]
    );
    
    // Create attacker with 10000 credits, 50 fighters, 50 shields, 100 turns
    attackerPlayerId = await createTestPlayerWithStats(
      attackerUserId,
      testUniverseId,
      11,
      10000, // credits
      50, // fighters
      50, // shields
      100 // turns
    );
    
    // Create defender with 10000 credits, 30 fighters, 30 shields
    defenderPlayerId = await createTestPlayerWithStats(
      defenderUserId,
      testUniverseId,
      11,
      10000, // credits
      30, // fighters
      30, // shields
      100, // turns
      'Defender Corp'
    );
  });

  afterAll(async () => {
    await cleanupTestDb();
    await closeTestPool();
  });

  beforeEach(async () => {
    // Reset players before each test
    await testPool.query(
      `UPDATE players SET 
        credits = 10000, 
        ship_fighters = 50, 
        ship_shields = 50,
        turns_remaining = 100,
        current_sector = 11,
        is_alive = TRUE,
        in_escape_pod = FALSE
       WHERE id = $1`,
      [attackerPlayerId]
    );
    await testPool.query(
      `UPDATE players SET 
        credits = 10000, 
        ship_fighters = 30, 
        ship_shields = 30,
        turns_remaining = 100,
        current_sector = 11,
        is_alive = TRUE,
        in_escape_pod = FALSE
       WHERE id = $1`,
      [defenderPlayerId]
    );
    // Clear bank accounts
    await testPool.query(`DELETE FROM bank_accounts WHERE player_id IN ($1, $2)`, 
      [attackerPlayerId, defenderPlayerId]);
  });

  describe('Combat Turn Cost (Should be 1, not 3)', () => {
    it('should consume only 1 turn per attack', async () => {
      const attackerBefore = await getPlayer(attackerPlayerId);
      expect(attackerBefore.turns_remaining).toBe(100);

      const result = await combatService.executeAttack(attackerPlayerId, defenderPlayerId);

      const attackerAfter = await getPlayer(attackerPlayerId);
      // Should have consumed 1 turn (100 - 1 = 99)
      expect(attackerAfter.turns_remaining).toBe(99);
    });

    it('should allow attack with only 1 turn remaining', async () => {
      await testPool.query(
        `UPDATE players SET turns_remaining = 1 WHERE id = $1`,
        [attackerPlayerId]
      );

      const canAttack = await combatService.canAttack(attackerPlayerId, defenderPlayerId);
      
      expect(canAttack.canAttack).toBe(true);
    });

    it('should reject attack with 0 turns', async () => {
      await testPool.query(
        `UPDATE players SET turns_remaining = 0 WHERE id = $1`,
        [attackerPlayerId]
      );

      const canAttack = await combatService.canAttack(attackerPlayerId, defenderPlayerId);
      
      expect(canAttack.canAttack).toBe(false);
      expect(canAttack.reason).toContain('1 turn'); // Should say 1 turn, not 3
    });
  });

  describe('Loot Percentage (Should be 75%, not 50%)', () => {
    it('should loot 75% of defender credits when defender is destroyed', async () => {
      // Make defender weak so attacker wins easily
      await testPool.query(
        `UPDATE players SET credits = 10000, ship_fighters = 1, ship_shields = 0 WHERE id = $1`,
        [defenderPlayerId]
      );
      // Make attacker strong
      await testPool.query(
        `UPDATE players SET ship_fighters = 100, ship_shields = 100 WHERE id = $1`,
        [attackerPlayerId]
      );
      // Warp connection already created in beforeAll

      const attackerBefore = await getPlayer(attackerPlayerId);

      const result = await combatService.executeAttack(attackerPlayerId, defenderPlayerId);

      // Attacker should have received 75% of 10000 = 7500 credits
      const attackerAfter = await getPlayer(attackerPlayerId);
      const expectedCredits = parseInt(String(attackerBefore.credits)) + 7500;
      expect(parseInt(String(attackerAfter.credits))).toBe(expectedCredits);
      
      // Verify combat result shows 75% loot
      expect(result.creditsLooted).toBe(7500);
    });

    it('should loot 75% of defender cargo when defender is destroyed', async () => {
      await testPool.query(
        `UPDATE players SET 
          credits = 10000, 
          cargo_fuel = 100, 
          cargo_organics = 200, 
          cargo_equipment = 300,
          ship_fighters = 1, 
          ship_shields = 0 
         WHERE id = $1`,
        [defenderPlayerId]
      );
      await testPool.query(
        `UPDATE players SET ship_fighters = 100, ship_shields = 100 WHERE id = $1`,
        [attackerPlayerId]
      );
      // Warp connection already created in beforeAll

      const result = await combatService.executeAttack(attackerPlayerId, defenderPlayerId);

      // Should loot 75% of each cargo type
      expect(result.cargoLooted.fuel).toBe(75); // 100 * 0.75
      expect(result.cargoLooted.organics).toBe(150); // 200 * 0.75
      expect(result.cargoLooted.equipment).toBe(225); // 300 * 0.75
    });
  });

  describe('Death Penalty (Should be 25%, not 50%)', () => {
    it('should apply 25% death penalty to on-hand credits', async () => {
      await testPool.query(
        `UPDATE players SET credits = 10000, ship_fighters = 1, ship_shields = 0 WHERE id = $1`,
        [defenderPlayerId]
      );
      await testPool.query(
        `UPDATE players SET ship_fighters = 100, ship_shields = 100 WHERE id = $1`,
        [attackerPlayerId]
      );
      // Warp connection already created in beforeAll

      const defenderBefore = await getPlayer(defenderPlayerId);
      expect(parseInt(String(defenderBefore.credits))).toBe(10000);

      await combatService.executeAttack(attackerPlayerId, defenderPlayerId);

      const defenderAfter = await getPlayer(defenderPlayerId);
      // Defender lost 7500 to looter, then 25% of remaining (2500 * 0.25 = 625)
      // So final credits should be: 10000 - 7500 - 625 = 1875
      const finalCredits = parseInt(String(defenderAfter.credits));
      expect(finalCredits).toBeLessThanOrEqual(1875);
      expect(finalCredits).toBeGreaterThanOrEqual(1870); // Allow small rounding
    });

    it('should apply 25% death penalty to bank balance', async () => {
      // Set up defender with bank balance
      await testPool.query(
        `UPDATE players SET credits = 10000, ship_fighters = 1, ship_shields = 0 WHERE id = $1`,
        [defenderPlayerId]
      );
      await testPool.query(
        `UPDATE players SET ship_fighters = 100, ship_shields = 100 WHERE id = $1`,
        [attackerPlayerId]
      );
      // Warp connection already created in beforeAll

      // Create bank account with 20000 credits
      await testPool.query(
        `INSERT INTO bank_accounts (universe_id, account_type, player_id, balance)
         VALUES ($1, 'personal', $2, 20000)`,
        [testUniverseId, defenderPlayerId]
      );

      const bankBefore = await getBankAccountBalance(defenderPlayerId, 'personal');
      expect(bankBefore).toBe(20000);

      await combatService.executeAttack(attackerPlayerId, defenderPlayerId);

      const bankAfter = await getBankAccountBalance(defenderPlayerId, 'personal');
      // Should lose 25% of bank balance: 20000 * 0.25 = 5000
      // Final: 20000 - 5000 = 15000
      expect(bankAfter).toBe(15000);
    });
  });
});

