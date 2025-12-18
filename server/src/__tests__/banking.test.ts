import { Request, Response } from 'express';
import {
  getTestPool,
  cleanupTestDb,
  createTestUser,
  createTestUniverse,
  createTestSector,
  createTestStardockSector,
  createTestPlayer,
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

// Import services after mocking
import * as bankingService from '../services/bankingService';

describe('Banking System - Economy Fixes', () => {
  let testUserId: number;
  let testUniverseId: number;
  let testPlayerId: number;
  let stardockSectorId: number;
  let regularSectorId: number;
  let testPool: any;

  beforeAll(async () => {
    testPool = getTestPool();
    await cleanupTestDb();
    
    testUserId = await createTestUser('test_banking_user');
    testUniverseId = await createTestUniverse('Banking Test Universe', 10);
    
    // Create sectors: one StarDock, one regular
    stardockSectorId = await createTestStardockSector(testUniverseId, 5, 'StarDock Alpha');
    regularSectorId = await createTestSector(testUniverseId, 1, 'Regular Sector');
    
    // Create player at StarDock with 10000 credits
    testPlayerId = await createTestPlayerWithStats(
      testUserId,
      testUniverseId,
      5, // StarDock sector
      10000, // credits
      10, // fighters
      10, // shields
      100 // turns
    );
  });

  afterAll(async () => {
    await cleanupTestDb();
    await closeTestPool();
  });

  describe('StarDock Location Requirement', () => {
    it('should allow deposit when player is at StarDock', async () => {
      // Ensure player is at StarDock
      await testPool.query(
        `UPDATE players SET current_sector = 5 WHERE id = $1`,
        [testPlayerId]
      );
      await testPool.query(
        `UPDATE sectors SET port_type = 'STARDOCK' WHERE id = $1`,
        [stardockSectorId]
      );

      const result = await bankingService.depositCredits(testPlayerId, 'personal', 1000);

      if (!result.success) {
        console.log('Deposit failed with error:', result.error);
      }
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      
      const bankBalance = await getBankAccountBalance(testPlayerId, 'personal');
      expect(bankBalance).toBe(1000);
    });

    it('should reject deposit when player is NOT at StarDock', async () => {
      // Move player to regular sector
      await testPool.query(
        `UPDATE players SET current_sector = 1 WHERE id = $1`,
        [testPlayerId]
      );
      await testPool.query(
        `UPDATE sectors SET port_type = NULL WHERE id = $1`,
        [regularSectorId]
      );

      const result = await bankingService.depositCredits(testPlayerId, 'personal', 1000);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('StarDock');
    });

    it('should reject withdrawal when player is NOT at StarDock', async () => {
      // Ensure player has bank balance
      await testPool.query(
        `UPDATE players SET current_sector = 5 WHERE id = $1`,
        [testPlayerId]
      );
      await testPool.query(
        `UPDATE sectors SET port_type = 'STARDOCK' WHERE id = $1`,
        [stardockSectorId]
      );
      await bankingService.depositCredits(testPlayerId, 'personal', 5000);
      
      // Move to regular sector
      await testPool.query(
        `UPDATE players SET current_sector = 1 WHERE id = $1`,
        [testPlayerId]
      );
      await testPool.query(
        `UPDATE sectors SET port_type = NULL WHERE id = $1`,
        [regularSectorId]
      );

      const result = await bankingService.withdrawCredits(testPlayerId, 'personal', 1000);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('StarDock');
    });
  });

  describe('Withdrawal Fee (5%)', () => {
    beforeEach(async () => {
      // Reset player to StarDock with 10000 credits
      await testPool.query(
        `UPDATE players SET current_sector = 5, credits = 10000 WHERE id = $1`,
        [testPlayerId]
      );
      await testPool.query(
        `UPDATE sectors SET port_type = 'STARDOCK' WHERE id = $1`,
        [stardockSectorId]
      );
      // Clear bank account
      await testPool.query(`DELETE FROM bank_accounts WHERE player_id = $1`, [testPlayerId]);
    });

    it('should charge 5% fee on withdrawal', async () => {
      // Deposit 10000 credits
      await bankingService.depositCredits(testPlayerId, 'personal', 10000);
      
      const playerBefore = await getPlayer(testPlayerId);
      const bankBalanceBefore = await getBankAccountBalance(testPlayerId, 'personal');
      expect(bankBalanceBefore).toBe(10000);
      expect(parseInt(String(playerBefore.credits))).toBe(0); // All deposited

      // Withdraw 1000 credits (should receive 950 after 5% fee)
      const result = await bankingService.withdrawCredits(testPlayerId, 'personal', 1000);
      
      expect(result.success).toBe(true);
      
      const playerAfter = await getPlayer(testPlayerId);
      const bankBalanceAfter = await getBankAccountBalance(testPlayerId, 'personal');
      
      // Player should receive 950 (1000 - 50 fee)
      expect(parseInt(String(playerAfter.credits))).toBe(950);
      // Bank should have 9000 remaining (10000 - 1000)
      expect(bankBalanceAfter).toBe(9000);
      
      // Verify transaction memo mentions fee
      expect(result.transaction?.memo).toContain('Withdrawal fee');
    });

    it('should calculate fee correctly for different amounts', async () => {
      await bankingService.depositCredits(testPlayerId, 'personal', 10000);
      
      // Withdraw 2000 (fee should be 100, receive 1900)
      const result = await bankingService.withdrawCredits(testPlayerId, 'personal', 2000);
      
      expect(result.success).toBe(true);
      
      const playerAfter = await getPlayer(testPlayerId);
      expect(parseInt(String(playerAfter.credits))).toBe(1900); // 2000 - 100 fee
    });
  });

  describe('Corporate Account Withdrawal Limits', () => {
    let corpId: number;
    let memberPlayerId: number;
    let officerPlayerId: number;
    let founderPlayerId: number;

    beforeAll(async () => {
      // Create corporation
      const corpResult = await testPool.query(
        `INSERT INTO corporations (universe_id, name, founder_id)
         VALUES ($1, 'Test Corp', $2)
         RETURNING id`,
        [testUniverseId, testPlayerId]
      );
      corpId = corpResult.rows[0].id;

      // Create members with different ranks
      const memberUserId = await createTestUser('test_member');
      const officerUserId = await createTestUser('test_officer');
      const founderUserId = testUserId;

      memberPlayerId = await createTestPlayerWithStats(
        memberUserId,
        testUniverseId,
        5,
        10000,
        10,
        10,
        100,
        'Test Corp'
      );
      officerPlayerId = await createTestPlayerWithStats(
        officerUserId,
        testUniverseId,
        5,
        10000,
        10,
        10,
        100,
        'Test Corp'
      );
      founderPlayerId = testPlayerId;

      // Add to corporation with ranks
      await testPool.query(
        `INSERT INTO corp_members (corp_id, player_id, rank)
         VALUES ($1, $2, 'member'), ($1, $3, 'officer'), ($1, $4, 'founder')`,
        [corpId, memberPlayerId, officerPlayerId, founderPlayerId]
      );

      // Create corporate account with 100000 credits
      await testPool.query(
        `INSERT INTO bank_accounts (universe_id, account_type, corp_id, balance)
         VALUES ($1, 'corporate', $2, 100000)`,
        [testUniverseId, corpId]
      );
    });

    it('should allow founder to withdraw unlimited amount', async () => {
      await testPool.query(
        `UPDATE players SET current_sector = 5 WHERE id = $1`,
        [founderPlayerId]
      );

      const result = await bankingService.withdrawCredits(founderPlayerId, 'corporate', 50000);
      
      expect(result.success).toBe(true);
    });

    it('should reject member withdrawal over ₡10,000 limit', async () => {
      await testPool.query(
        `UPDATE players SET current_sector = 5 WHERE id = $1`,
        [memberPlayerId]
      );

      const result = await bankingService.withdrawCredits(memberPlayerId, 'corporate', 15000);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('₡10,000');
    });

    it('should allow member to withdraw up to ₡10,000', async () => {
      await testPool.query(
        `UPDATE players SET current_sector = 5 WHERE id = $1`,
        [memberPlayerId]
      );

      const result = await bankingService.withdrawCredits(memberPlayerId, 'corporate', 10000);
      
      expect(result.success).toBe(true);
    });

    it('should reject officer withdrawal over ₡100,000 limit', async () => {
      await testPool.query(
        `UPDATE players SET current_sector = 5 WHERE id = $1`,
        [officerPlayerId]
      );

      const result = await bankingService.withdrawCredits(officerPlayerId, 'corporate', 150000);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('₡100,000');
    });

    it('should allow officer to withdraw up to ₡100,000', async () => {
      // Reset corporate account balance
      await testPool.query(
        `UPDATE bank_accounts SET balance = 200000 WHERE corp_id = $1 AND account_type = 'corporate'`,
        [corpId]
      );
      await testPool.query(
        `UPDATE players SET current_sector = 5 WHERE id = $1`,
        [officerPlayerId]
      );

      const result = await bankingService.withdrawCredits(officerPlayerId, 'corporate', 100000);
      
      expect(result.success).toBe(true);
      if (!result.success) {
        console.log('Error:', result.error);
      }
    });
  });
});

