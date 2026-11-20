import {
  getTestPool,
  cleanupTestDb,
  createTestUser,
  createTestUniverse,
  createTestSector,
  createTestPlayerWithStats,
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

import { activePlayerSql, runWithActivePlayer } from '../utils/activePlayer';
import { generateToken, verifyToken } from '../utils/jwt';
import { authenticateToken } from '../middleware/auth';
import { selectPlayer, getUserPlayers, initializePlayer } from '../controllers/playerController';
import { getHunterLeaderboard } from '../services/bountyService';

describe('Universe picker (active player scoping)', () => {
  let userId: number;
  let otherUserId: number;
  let season1Universe: number;
  let season2Universe: number;
  let thirdUniverse: number;
  let oldPlayerId: number;
  let newPlayerId: number;
  let otherUsersPlayerId: number;

  const mockRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const userClaims = (id: number, playerId?: number) => ({
    userId: id,
    username: `test_picker_${id}`,
    email: `picker${id}@example.com`,
    isAdmin: false,
    ...(playerId ? { playerId } : {}),
  });

  // Run a lookup the way every route does, through the real auth
  // middleware, and report which player row the caller resolves to.
  const resolveThroughAuth = (token: string, ownerId: number): Promise<number[]> =>
    new Promise((resolve, reject) => {
      const req: any = { headers: { authorization: `Bearer ${token}` } };
      const res = mockRes();
      authenticateToken(req, res, async () => {
        try {
          const result = await testPool.query(
            `SELECT id FROM players WHERE user_id = $1${activePlayerSql()}`,
            [ownerId]
          );
          resolve(result.rows.map((r: any) => r.id));
        } catch (error) {
          reject(error);
        }
      });
    });

  beforeAll(async () => {
    await cleanupTestDb();
    userId = await createTestUser();
    otherUserId = await createTestUser();
    season1Universe = await createTestUniverse('Picker Season 1');
    season2Universe = await createTestUniverse('Picker Season 2');
    thirdUniverse = await createTestUniverse('Picker Third');
    for (const u of [season1Universe, season2Universe, thirdUniverse]) {
      await createTestSector(u, 1);
    }
    oldPlayerId = await createTestPlayerWithStats(userId, season1Universe, 1, 900000, 10, 10, 100, 'Old Corp');
    // Created later, so it is the newest player for this user.
    await testPool.query(`UPDATE players SET created_at = NOW() - INTERVAL '30 days' WHERE id = $1`, [oldPlayerId]);
    newPlayerId = await createTestPlayerWithStats(userId, season2Universe, 1, 5000, 10, 10, 100, 'New Corp');
    otherUsersPlayerId = await createTestPlayerWithStats(otherUserId, season2Universe, 1, 5000, 10, 10, 100, 'Rival Corp');
  });

  afterAll(async () => {
    await cleanupTestDb();
    await closeTestPool();
  });

  describe('activePlayerSql', () => {
    it('is empty outside a request so ticks and direct service calls are unchanged', () => {
      expect(activePlayerSql()).toBe('');
    });

    it('scopes to the token player, with or without a table alias', () => {
      runWithActivePlayer({ userId: 7, playerId: 42 }, () => {
        expect(activePlayerSql()).toBe(' AND id = 42');
        expect(activePlayerSql('p')).toBe(' AND p.id = 42');
      });
    });

    it('falls back to the newest player when the token has no player id', () => {
      runWithActivePlayer({ userId: 7, playerId: null }, () => {
        const sql = activePlayerSql('p');
        expect(sql).toContain('p.id = (SELECT newest.id FROM players newest WHERE newest.user_id = 7');
        expect(sql).toContain('ORDER BY newest.created_at DESC');
      });
    });

    it('never inlines anything that is not a positive integer', () => {
      runWithActivePlayer({ userId: 7, playerId: '1; DROP TABLE players' as any }, () => {
        expect(activePlayerSql()).not.toContain('DROP');
      });
      runWithActivePlayer({ userId: 'x' as any, playerId: null }, () => {
        expect(activePlayerSql()).toBe('');
      });
    });
  });

  describe('lookups through the auth middleware', () => {
    it('an old token (no player id) resolves to exactly one player: the newest', async () => {
      const ids = await resolveThroughAuth(generateToken(userClaims(userId)), userId);
      expect(ids).toEqual([newPlayerId]);
    });

    it('a scoped token resolves to the picked player only', async () => {
      const ids = await resolveThroughAuth(generateToken(userClaims(userId, oldPlayerId)), userId);
      expect(ids).toEqual([oldPlayerId]);
    });

    it("a token naming someone else's player resolves to nothing", async () => {
      const ids = await resolveThroughAuth(generateToken(userClaims(userId, otherUsersPlayerId)), userId);
      expect(ids).toEqual([]);
    });

    it('real services follow the picked player into its universe', async () => {
      const token = generateToken(userClaims(userId, oldPlayerId));
      const req: any = { headers: { authorization: `Bearer ${token}` } };
      await testPool.query(
        `INSERT INTO bounty_hunters (player_id, bounties_claimed, bounty_credits_earned) VALUES ($1, 2, 30000)
         ON CONFLICT (player_id) DO NOTHING`,
        [oldPlayerId]
      );
      const board = await new Promise<any[]>((resolve, reject) => {
        authenticateToken(req, mockRes(), () => {
          getHunterLeaderboard(userId).then(resolve, reject);
        });
      });
      expect(board.map((r) => r.corp_name)).toContain('Old Corp');
    });
  });

  describe('POST /api/players/:id/select', () => {
    it('returns a token scoped to the chosen player', async () => {
      const req: any = { user: userClaims(userId), params: { id: String(oldPlayerId) } };
      const res = mockRes();
      await selectPlayer(req, res);
      const body = res.json.mock.calls[0][0];
      expect(res.status).not.toHaveBeenCalled();
      expect(body.player.id).toBe(oldPlayerId);
      const claims = verifyToken(body.token)!;
      expect(claims.playerId).toBe(oldPlayerId);
      expect(claims.userId).toBe(userId);
    });

    it("refuses another user's player with a plain 404", async () => {
      const req: any = { user: userClaims(userId), params: { id: String(otherUsersPlayerId) } };
      const res = mockRes();
      await selectPlayer(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('rejects a non numeric id', async () => {
      const req: any = { user: userClaims(userId), params: { id: 'abc' } };
      const res = mockRes();
      await selectPlayer(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('GET /api/players', () => {
    it('lists every ship newest first and names the active one', async () => {
      const req: any = { user: userClaims(userId, oldPlayerId) };
      const res = mockRes();
      await getUserPlayers(req, res);
      const body = res.json.mock.calls[0][0];
      expect(body.players.map((p: any) => p.id)).toEqual([newPlayerId, oldPlayerId]);
      expect(body.activePlayerId).toBe(oldPlayerId);
      expect(body.players[0].universeName).toBe('Picker Season 2');
    });

    it('defaults the active ship to the newest for old tokens', async () => {
      const req: any = { user: userClaims(userId) };
      const res = mockRes();
      await getUserPlayers(req, res);
      expect(res.json.mock.calls[0][0].activePlayerId).toBe(newPlayerId);
    });
  });

  describe('POST /api/players (joining another universe)', () => {
    it('returns a token scoped to the new player', async () => {
      const req: any = {
        user: userClaims(userId, oldPlayerId),
        body: { universeId: thirdUniverse, corpName: 'Third Corp' },
      };
      const res = mockRes();
      await initializePlayer(req, res);
      expect(res.status).toHaveBeenCalledWith(201);
      const body = res.json.mock.calls[0][0];
      expect(verifyToken(body.token)!.playerId).toBe(body.player.id);
      expect(body.player.universeId).toBe(thirdUniverse);
    });
  });
});
