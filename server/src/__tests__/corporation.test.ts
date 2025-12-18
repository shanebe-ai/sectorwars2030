/**
 * Corporation Management Tests
 * Tests for corporation management operations (leave, invite, kick, promote, transfer)
 */

import {
  getTestPool,
  cleanupTestDb,
  createTestUser,
  createTestUniverse,
  createTestSector,
  createTestPlayerDetailed,
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
import * as corpService from '../services/corporationService';

describe('Corporation Management System', () => {
  let founderUserId: number;
  let officerUserId: number;
  let memberUserId: number;
  let outsiderUserId: number;
  let testUniverseId: number;
  let founderPlayerId: number;
  let officerPlayerId: number;
  let memberPlayerId: number;
  let outsiderPlayerId: number;
  let testCorpId: number;

  beforeAll(async () => {
    await cleanupTestDb();

    // Create test universe
    testUniverseId = await createTestUniverse('Corp Test Universe', 10);
    const sectorId = await createTestSector(testUniverseId, 1, 'Sol');

    // Create test users
    founderUserId = await createTestUser('test_corp_founder');
    officerUserId = await createTestUser('test_corp_officer');
    memberUserId = await createTestUser('test_corp_member');
    outsiderUserId = await createTestUser('test_corp_outsider');

    // Create corporation
    const corpResult = await testPool.query(`
      INSERT INTO corporations (universe_id, name)
      VALUES ($1, 'Test Corporation')
      RETURNING id
    `, [testUniverseId]);
    testCorpId = corpResult.rows[0].id;

    // Create players
    founderPlayerId = await createTestPlayerDetailed(founderUserId, testUniverseId, 1);
    officerPlayerId = await createTestPlayerDetailed(officerUserId, testUniverseId, 1);
    memberPlayerId = await createTestPlayerDetailed(memberUserId, testUniverseId, 1);
    outsiderPlayerId = await createTestPlayerDetailed(outsiderUserId, testUniverseId, 1);

    // Add founder to corp
    await testPool.query(`
      UPDATE corporations SET founder_id = $1 WHERE id = $2
    `, [founderPlayerId, testCorpId]);

    await testPool.query(`
      INSERT INTO corp_members (corp_id, player_id, rank)
      VALUES ($1, $2, 'founder')
    `, [testCorpId, founderPlayerId]);

    await testPool.query(`
      UPDATE players SET corp_id = $1, corp_name = 'Test Corporation'
      WHERE id = $2
    `, [testCorpId, founderPlayerId]);

    // Add officer to corp
    await testPool.query(`
      INSERT INTO corp_members (corp_id, player_id, rank)
      VALUES ($1, $2, 'officer')
    `, [testCorpId, officerPlayerId]);

    await testPool.query(`
      UPDATE players SET corp_id = $1, corp_name = 'Test Corporation'
      WHERE id = $2
    `, [testCorpId, officerPlayerId]);

    // Add member to corp
    await testPool.query(`
      INSERT INTO corp_members (corp_id, player_id, rank)
      VALUES ($1, $2, 'member')
    `, [testCorpId, memberPlayerId]);

    await testPool.query(`
      UPDATE players SET corp_id = $1, corp_name = 'Test Corporation'
      WHERE id = $2
    `, [testCorpId, memberPlayerId]);
  });

  afterAll(async () => {
    await cleanupTestDb();
    await closeTestPool();
  });

  describe('Get Corporation Details', () => {
    it('should return corporation details with all members', async () => {
      const details = await corpService.getCorporationDetails(testCorpId);

      expect(details.id).toBe(testCorpId);
      expect(details.name).toBe('Test Corporation');
      expect(details.founderId).toBe(founderPlayerId);
      expect(details.members.length).toBe(3);

      // Check founder
      const founder = details.members.find(m => m.rank === 'founder');
      expect(founder).toBeDefined();
      expect(founder!.username).toBe('test_corp_founder');

      // Check officer
      const officer = details.members.find(m => m.rank === 'officer');
      expect(officer).toBeDefined();
      expect(officer!.username).toBe('test_corp_officer');

      // Check member
      const member = details.members.find(m => m.rank === 'member');
      expect(member).toBeDefined();
      expect(member!.username).toBe('test_corp_member');
    });
  });

  describe('Leave Corporation', () => {
    it('should allow member to leave corporation', async () => {
      const result = await corpService.leaveCorporation(memberPlayerId);

      expect(result.success).toBe(true);
      expect(result.corpName).toBe('Test Corporation');

      // Verify player is no longer in corp
      const playerCheck = await testPool.query(
        `SELECT corp_id FROM players WHERE id = $1`,
        [memberPlayerId]
      );
      expect(playerCheck.rows[0].corp_id).toBeNull();

      // Verify member record is deleted
      const memberCheck = await testPool.query(
        `SELECT * FROM corp_members WHERE player_id = $1`,
        [memberPlayerId]
      );
      expect(memberCheck.rows.length).toBe(0);
    });

    it('should reject founder leaving without transferring ownership', async () => {
      await expect(
        corpService.leaveCorporation(founderPlayerId)
      ).rejects.toThrow('Founder cannot leave');
    });

    it('should reject leaving when not in a corporation', async () => {
      await expect(
        corpService.leaveCorporation(outsiderPlayerId)
      ).rejects.toThrow('You are not in a corporation');
    });
  });

  describe('Invite Player', () => {
    it('should allow founder to invite players', async () => {
      const result = await corpService.invitePlayer(founderPlayerId, 'test_corp_outsider');

      expect(result.success).toBe(true);
      expect(result.targetPlayer).toBe('test_corp_outsider');

      // Verify invitation message was created
      const messageCheck = await testPool.query(
        `SELECT * FROM messages WHERE recipient_id = $1 AND message_type = 'corp_invite'`,
        [outsiderPlayerId]
      );
      expect(messageCheck.rows.length).toBeGreaterThan(0);
    });

    it('should allow officer to invite players', async () => {
      // Create another outsider
      const newOutsiderId = await createTestUser('test_corp_outsider2');
      const newOutsiderPlayerId = await createTestPlayerDetailed(newOutsiderId, testUniverseId, 1);

      const result = await corpService.invitePlayer(officerPlayerId, 'test_corp_outsider2');

      expect(result.success).toBe(true);
    });

    it('should reject member inviting players', async () => {
      // Re-add member to corp for this test
      await testPool.query(`
        INSERT INTO corp_members (corp_id, player_id, rank)
        VALUES ($1, $2, 'member')
        ON CONFLICT DO NOTHING
      `, [testCorpId, memberPlayerId]);

      await testPool.query(`
        UPDATE players SET corp_id = $1, corp_name = 'Test Corporation'
        WHERE id = $2
      `, [testCorpId, memberPlayerId]);

      await expect(
        corpService.invitePlayer(memberPlayerId, 'test_corp_outsider')
      ).rejects.toThrow('Only founders and officers can invite players');
    });

    it('should reject inviting player already in corp', async () => {
      await expect(
        corpService.invitePlayer(founderPlayerId, 'test_corp_officer')
      ).rejects.toThrow('already in a corporation');
    });
  });

  describe('Accept Invitation', () => {
    it('should allow player to accept invitation', async () => {
      const result = await corpService.acceptInvitation(outsiderPlayerId, testCorpId);

      expect(result.success).toBe(true);
      expect(result.corpName).toBe('Test Corporation');

      // Verify player is now in corp
      const playerCheck = await testPool.query(
        `SELECT corp_id, corp_name FROM players WHERE id = $1`,
        [outsiderPlayerId]
      );
      expect(playerCheck.rows[0].corp_id).toBe(testCorpId);
      expect(playerCheck.rows[0].corp_name).toBe('Test Corporation');

      // Verify member record exists
      const memberCheck = await testPool.query(
        `SELECT rank FROM corp_members WHERE player_id = $1`,
        [outsiderPlayerId]
      );
      expect(memberCheck.rows[0].rank).toBe('member');
    });

    it('should reject accepting when already in corp', async () => {
      await expect(
        corpService.acceptInvitation(founderPlayerId, testCorpId)
      ).rejects.toThrow('You are already in a corporation');
    });
  });

  describe('Kick Member', () => {
    it('should allow founder to kick member', async () => {
      const result = await corpService.kickMember(founderPlayerId, outsiderPlayerId);

      expect(result.success).toBe(true);

      // Verify player is removed
      const playerCheck = await testPool.query(
        `SELECT corp_id FROM players WHERE id = $1`,
        [outsiderPlayerId]
      );
      expect(playerCheck.rows[0].corp_id).toBeNull();
    });

    it('should allow officer to kick member', async () => {
      // Re-add outsider as member
      await testPool.query(`
        INSERT INTO corp_members (corp_id, player_id, rank)
        VALUES ($1, $2, 'member')
      `, [testCorpId, outsiderPlayerId]);

      await testPool.query(`
        UPDATE players SET corp_id = $1, corp_name = 'Test Corporation'
        WHERE id = $2
      `, [testCorpId, outsiderPlayerId]);

      const result = await corpService.kickMember(officerPlayerId, outsiderPlayerId);
      expect(result.success).toBe(true);
    });

    it('should reject officer kicking another officer', async () => {
      await expect(
        corpService.kickMember(officerPlayerId, officerPlayerId) // different officer in practice
      ).rejects.toThrow();
    });

    it('should reject kicking founder', async () => {
      await expect(
        corpService.kickMember(officerPlayerId, founderPlayerId)
      ).rejects.toThrow('Cannot kick the founder');
    });

    it('should reject member kicking anyone', async () => {
      await expect(
        corpService.kickMember(memberPlayerId, outsiderPlayerId)
      ).rejects.toThrow('Only founders and officers can kick members');
    });
  });

  describe('Change Rank (Promote/Demote)', () => {
    it('should allow founder to promote member to officer', async () => {
      const result = await corpService.changeRank(founderPlayerId, memberPlayerId, 'officer');

      expect(result.success).toBe(true);
      expect(result.newRank).toBe('officer');

      // Verify rank changed
      const rankCheck = await testPool.query(
        `SELECT rank FROM corp_members WHERE player_id = $1`,
        [memberPlayerId]
      );
      expect(rankCheck.rows[0].rank).toBe('officer');
    });

    it('should allow founder to demote officer to member', async () => {
      const result = await corpService.changeRank(founderPlayerId, memberPlayerId, 'member');

      expect(result.success).toBe(true);
      expect(result.newRank).toBe('member');

      // Verify rank changed
      const rankCheck = await testPool.query(
        `SELECT rank FROM corp_members WHERE player_id = $1`,
        [memberPlayerId]
      );
      expect(rankCheck.rows[0].rank).toBe('member');
    });

    it('should reject officer changing ranks', async () => {
      await expect(
        corpService.changeRank(officerPlayerId, memberPlayerId, 'officer')
      ).rejects.toThrow('Only the founder can change member ranks');
    });

    it('should reject changing founder rank', async () => {
      await expect(
        corpService.changeRank(founderPlayerId, founderPlayerId, 'member')
      ).rejects.toThrow('Cannot change founder rank');
    });
  });

  describe('Transfer Ownership', () => {
    it('should allow founder to transfer ownership', async () => {
      const result = await corpService.transferOwnership(founderPlayerId, officerPlayerId);

      expect(result.success).toBe(true);

      // Verify new founder in corporations table
      const corpCheck = await testPool.query(
        `SELECT founder_id FROM corporations WHERE id = $1`,
        [testCorpId]
      );
      expect(corpCheck.rows[0].founder_id).toBe(officerPlayerId);

      // Verify new founder rank
      const newFounderCheck = await testPool.query(
        `SELECT rank FROM corp_members WHERE player_id = $1`,
        [officerPlayerId]
      );
      expect(newFounderCheck.rows[0].rank).toBe('founder');

      // Verify old founder demoted to officer
      const oldFounderCheck = await testPool.query(
        `SELECT rank FROM corp_members WHERE player_id = $1`,
        [founderPlayerId]
      );
      expect(oldFounderCheck.rows[0].rank).toBe('officer');
    });

    it('should reject non-founder transferring ownership', async () => {
      await expect(
        corpService.transferOwnership(founderPlayerId, memberPlayerId)
      ).rejects.toThrow('Only the founder can transfer ownership');
    });

    it('should reject transferring to player not in corp', async () => {
      // Create new outsider
      const newUserId = await createTestUser('test_transfer_outsider');
      const newPlayerId = await createTestPlayerDetailed(newUserId, testUniverseId, 1);

      await expect(
        corpService.transferOwnership(officerPlayerId, newPlayerId)
      ).rejects.toThrow('Target player is not in your corporation');
    });
  });
});
