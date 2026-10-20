import {
  getTestPool,
  cleanupTestDb,
  createTestUser,
  createTestUniverse,
  createTestSector,
  createTestPlayerWithStats,
  getPlayer,
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

import {
  dueWarning,
  describeHours,
  seasonsAvailable,
  getActiveSeason,
  getStandings,
  getHallOfFame,
  startSeason,
  extendSeason,
  endSeason,
  runSeasonTick,
} from '../services/seasonService';
import {
  getUniverseSeasons,
  getSeasonStandings,
  adminStartSeason,
  adminExtendSeason,
  adminEndSeason,
} from '../controllers/seasonController';

describe('Seasons', () => {
  let universeId: number;
  let otherUniverseId: number;
  let richPlayerId: number;
  let midPlayerId: number;
  let poorPlayerId: number;

  const mockRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const tnnSubjects = async (uid: number): Promise<string[]> => {
    const result = await testPool.query(
      `SELECT subject FROM messages
       WHERE universe_id = $1 AND message_type = 'BROADCAST' AND sender_name = 'TerraCorp News Network'
       ORDER BY id ASC`,
      [uid]
    );
    return result.rows.map((r) => r.subject);
  };

  const setEndsIn = async (seasonId: number, hours: number) => {
    await testPool.query(
      `UPDATE seasons SET ends_at = NOW() + make_interval(secs => $2::double precision) WHERE id = $1`,
      [seasonId, hours * 3600]
    );
  };

  const playerSnapshot = async (playerId: number) => {
    const p = await getPlayer(playerId);
    const planets = await testPool.query(
      `SELECT id, fuel, organics, equipment, credits, colonists FROM planets WHERE owner_id = $1 ORDER BY id`,
      [playerId]
    );
    const bank = await testPool.query(
      `SELECT balance FROM bank_accounts WHERE player_id = $1`,
      [playerId]
    );
    return { player: p, planets: planets.rows, bank: bank.rows };
  };

  beforeAll(async () => {
    await cleanupTestDb();
    expect(await seasonsAvailable()).toBe(true);

    universeId = await createTestUniverse('Seasons Test Universe', 50);
    otherUniverseId = await createTestUniverse('Seasons Other Universe', 50);
    await createTestSector(universeId, 20, 'Season Sector');

    const u1 = await createTestUser('test_season_rich');
    const u2 = await createTestUser('test_season_mid');
    const u3 = await createTestUser('test_season_poor');
    richPlayerId = await createTestPlayerWithStats(u1, universeId, 20, 90000, 10, 10, 100, 'Rich Corp');
    midPlayerId = await createTestPlayerWithStats(u2, universeId, 20, 50000, 10, 10, 100, 'Mid Corp');
    poorPlayerId = await createTestPlayerWithStats(u3, universeId, 20, 1000, 10, 10, 100, 'Poor Corp');

    // Bank money counts toward net worth: lifts Poor Corp above Mid Corp.
    await testPool.query(
      `INSERT INTO bank_accounts (universe_id, account_type, player_id, balance)
       VALUES ($1, 'personal', $2, 60000)`,
      [universeId, poorPlayerId]
    );
  });

  afterAll(async () => {
    await testPool.query(`DELETE FROM seasons WHERE universe_id IN ($1, $2)`, [universeId, otherUniverseId]);
    await testPool.query(`DELETE FROM bank_accounts WHERE universe_id = $1`, [universeId]);
    await testPool.query(`DELETE FROM messages WHERE universe_id IN ($1, $2)`, [universeId, otherUniverseId]);
    await cleanupTestDb();
    await closeTestPool();
  });

  beforeEach(async () => {
    await testPool.query(`DELETE FROM seasons WHERE universe_id IN ($1, $2)`, [universeId, otherUniverseId]);
    await testPool.query(`DELETE FROM messages WHERE universe_id IN ($1, $2)`, [universeId, otherUniverseId]);
  });

  describe('warning schedule', () => {
    it('sends nothing while more than 7 days remain', () => {
      expect(dueWarning(200, null)).toBeNull();
    });

    it('picks the tightest due warning only', () => {
      expect(dueWarning(160, null)).toBe(168);
      expect(dueWarning(20, null)).toBe(24);
      expect(dueWarning(0.5, null)).toBe(1);
    });

    it('never repeats a warning already sent', () => {
      expect(dueWarning(100, 168)).toBeNull();
      expect(dueWarning(23, 168)).toBe(24);
      expect(dueWarning(23, 24)).toBeNull();
      expect(dueWarning(0.9, 24)).toBe(1);
      expect(dueWarning(0.5, 1)).toBeNull();
    });

    it('sends no warning once time is up', () => {
      expect(dueWarning(0, null)).toBeNull();
      expect(dueWarning(-1, null)).toBeNull();
    });

    it('describes hours in words', () => {
      expect(describeHours(168)).toBe('7 days');
      expect(describeHours(24)).toBe('24 hours');
      expect(describeHours(1)).toBe('1 hour');
      expect(describeHours(720)).toBe('30 days');
      expect(describeHours(36)).toBe('36 hours');
    });
  });

  describe('starting a season', () => {
    it('starts season 1 with a default name and announces it', async () => {
      const result = await startSeason(universeId, 30);
      expect(result.success).toBe(true);
      expect(result.season!.seasonNumber).toBe(1);
      expect(result.season!.name).toBe('Season 1');
      expect(result.season!.status).toBe('active');

      const hours = (new Date(result.season!.endsAt).getTime() - new Date(result.season!.startsAt).getTime()) / 3600000;
      expect(hours).toBeCloseTo(720, 0);

      expect(await tnnSubjects(universeId)).toEqual(['Season 1 has begun']);
    });

    it('uses a custom name and numbers seasons per universe', async () => {
      await startSeason(universeId, 1);
      const active = await getActiveSeason(universeId);
      await endSeason(active!.id);

      const second = await startSeason(universeId, 7, '  Gold Rush  ');
      expect(second.season!.seasonNumber).toBe(2);
      expect(second.season!.name).toBe('Gold Rush');

      const other = await startSeason(otherUniverseId, 7);
      expect(other.season!.seasonNumber).toBe(1);
    });

    it('refuses a second running season in the same universe', async () => {
      await startSeason(universeId, 10);
      const again = await startSeason(universeId, 10);
      expect(again.success).toBe(false);
      expect(again.message).toMatch(/already running/);
    });

    it('rejects bad lengths and unknown universes', async () => {
      expect((await startSeason(universeId, 0)).success).toBe(false);
      expect((await startSeason(universeId, 400)).success).toBe(false);
      expect((await startSeason(universeId, NaN)).success).toBe(false);
      expect((await startSeason(99999999, 10)).message).toBe('Universe not found');
      expect(await getActiveSeason(universeId)).toBeNull();
    });
  });

  describe('season tick', () => {
    it('warns at 7 days, 24 hours and 1 hour, once each', async () => {
      const { season } = await startSeason(universeId, 30);
      const id = season!.id;

      await runSeasonTick();
      expect(await tnnSubjects(universeId)).toEqual(['Season 1 has begun']);

      await setEndsIn(id, 100);
      await runSeasonTick();
      await runSeasonTick();
      await setEndsIn(id, 20);
      await runSeasonTick();
      await runSeasonTick();
      await setEndsIn(id, 0.5);
      await runSeasonTick();
      await runSeasonTick();

      expect(await tnnSubjects(universeId)).toEqual([
        'Season 1 has begun',
        'Season 1 ends in 7 days',
        'Season 1 ends in 24 hours',
        'Season 1 ends in 1 hour',
      ]);
      expect((await getActiveSeason(universeId))!.status).toBe('active');
    });

    it('ends an expired season, archives standings and announces the podium', async () => {
      const { season } = await startSeason(universeId, 5);
      await setEndsIn(season!.id, -0.1);

      await runSeasonTick();

      expect(await getActiveSeason(universeId)).toBeNull();
      const standings = await getStandings(season!.id);
      expect(standings.map((s) => s.corpName)).toEqual(['Rich Corp', 'Poor Corp', 'Mid Corp']);
      expect(standings.map((s) => s.rank)).toEqual([1, 2, 3]);
      expect(standings[1].networth).toBeGreaterThanOrEqual(61000);
      expect(standings[0].username).toBe('test_season_rich');

      const subjects = await tnnSubjects(universeId);
      expect(subjects[subjects.length - 1]).toBe('Season 1 has ended');

      // A second tick does not end it again or archive twice.
      await runSeasonTick();
      expect((await getStandings(season!.id)).length).toBe(3);
    });

    it('leaves seasons in other universes alone', async () => {
      const mine = await startSeason(universeId, 5);
      await startSeason(otherUniverseId, 5);
      await setEndsIn(mine.season!.id, -1);

      await runSeasonTick();

      expect(await getActiveSeason(universeId)).toBeNull();
      expect(await getActiveSeason(otherUniverseId)).not.toBeNull();
    });
  });

  describe('fairness: ending a season touches no player assets', () => {
    it('leaves ships, cargo, credits, bank and planets exactly as they were', async () => {
      await testPool.query(
        `UPDATE players SET cargo_fuel = 5, cargo_organics = 6, cargo_equipment = 7, ship_fighters = 33 WHERE id = $1`,
        [richPlayerId]
      );
      await testPool.query(
        `INSERT INTO planets (universe_id, sector_id, name, owner_id, fuel, organics, equipment, credits, colonists)
         SELECT $1, s.id, 'Season Rock', $2, 10, 20, 30, 400, 500 FROM sectors s
         WHERE s.universe_id = $1 AND s.sector_number = 20`,
        [universeId, richPlayerId]
      );
      const before = await Promise.all([richPlayerId, midPlayerId, poorPlayerId].map(playerSnapshot));

      const { season } = await startSeason(universeId, 3);
      await endSeason(season!.id);

      const after = await Promise.all([richPlayerId, midPlayerId, poorPlayerId].map(playerSnapshot));
      expect(after).toEqual(before);

      // The planet counts toward the archived net worth.
      const standings = await getStandings(season!.id);
      expect(standings[0].corpName).toBe('Rich Corp');
      expect(standings[0].planetCount).toBe(1);

      await testPool.query(`DELETE FROM planets WHERE owner_id = $1`, [richPlayerId]);
    });
  });

  describe('extend and end', () => {
    it('extends the running season and restarts the warnings', async () => {
      const { season } = await startSeason(universeId, 10);
      await setEndsIn(season!.id, 20);
      await runSeasonTick();
      expect((await getActiveSeason(universeId))!.lastWarningHours).toBe(24);

      const result = await extendSeason(season!.id, 7);
      expect(result.success).toBe(true);
      expect(result.season!.lastWarningHours).toBeNull();
      const hoursLeft = (new Date(result.season!.endsAt).getTime() - Date.now()) / 3600000;
      expect(hoursLeft).toBeGreaterThan(187);
      expect(hoursLeft).toBeLessThan(189);

      const subjects = await tnnSubjects(universeId);
      expect(subjects[subjects.length - 1]).toBe('Season 1 extended');
    });

    it('rejects bad extensions and ended seasons', async () => {
      const { season } = await startSeason(universeId, 10);
      expect((await extendSeason(season!.id, 0)).success).toBe(false);
      expect((await extendSeason(season!.id, -3)).success).toBe(false);
      await endSeason(season!.id);
      expect((await extendSeason(season!.id, 3)).success).toBe(false);
      expect((await endSeason(season!.id)).success).toBe(false);
    });

    it('builds a Hall of Fame from ended seasons, newest first', async () => {
      const s1 = await startSeason(universeId, 3);
      await endSeason(s1.season!.id);
      const s2 = await startSeason(universeId, 3, 'Second Run');
      await endSeason(s2.season!.id);
      await startSeason(universeId, 3);

      const hall = await getHallOfFame(universeId, 3);
      expect(hall.map((h) => h.season.name)).toEqual(['Second Run', 'Season 1']);
      expect(hall[0].standings.length).toBe(3);
      expect(hall[0].standings[0].corpName).toBe('Rich Corp');
    });
  });

  describe('API handlers', () => {
    it('returns current season, history and Hall of Fame', async () => {
      const s1 = await startSeason(universeId, 3);
      await endSeason(s1.season!.id);
      await startSeason(universeId, 14, 'Live One');

      const res = mockRes();
      await getUniverseSeasons({ params: { universeId: String(universeId) } } as any, res);
      const body = res.json.mock.calls[0][0];
      expect(body.available).toBe(true);
      expect(body.current.name).toBe('Live One');
      expect(body.seasons.length).toBe(2);
      expect(body.hallOfFame.length).toBe(1);
      expect(typeof body.serverTime).toBe('string');
    });

    it('returns a null current season when none is running', async () => {
      const res = mockRes();
      await getUniverseSeasons({ params: { universeId: String(universeId) } } as any, res);
      expect(res.json.mock.calls[0][0].current).toBeNull();
    });

    it('validates ids', async () => {
      const res = mockRes();
      await getUniverseSeasons({ params: { universeId: 'abc' } } as any, res);
      expect(res.status).toHaveBeenCalledWith(400);

      const res2 = mockRes();
      await getSeasonStandings({ params: { seasonId: '99999999' } } as any, res2);
      expect(res2.status).toHaveBeenCalledWith(404);
    });

    it('serves archived standings', async () => {
      const s1 = await startSeason(universeId, 3);
      await endSeason(s1.season!.id);
      const res = mockRes();
      await getSeasonStandings({ params: { seasonId: String(s1.season!.id) } } as any, res);
      const body = res.json.mock.calls[0][0];
      expect(body.season.status).toBe('ended');
      expect(body.standings.length).toBe(3);
    });

    it('admin handlers start, extend and end a season', async () => {
      const startRes = mockRes();
      await adminStartSeason({ body: { universeId, durationDays: 21, name: 'Admin Season' } } as any, startRes);
      const started = startRes.json.mock.calls[0][0];
      expect(started.success).toBe(true);

      const dupRes = mockRes();
      await adminStartSeason({ body: { universeId, durationDays: 21 } } as any, dupRes);
      expect(dupRes.status).toHaveBeenCalledWith(400);

      const badRes = mockRes();
      await adminStartSeason({ body: { durationDays: 21 } } as any, badRes);
      expect(badRes.status).toHaveBeenCalledWith(400);

      const extRes = mockRes();
      await adminExtendSeason({ params: { id: String(started.season.id) }, body: { days: 2 } } as any, extRes);
      expect(extRes.json.mock.calls[0][0].success).toBe(true);

      const endRes = mockRes();
      await adminEndSeason({ params: { id: String(started.season.id) } } as any, endRes);
      expect(endRes.json.mock.calls[0][0].standings[0].corpName).toBe('Rich Corp');

      const endAgain = mockRes();
      await adminEndSeason({ params: { id: String(started.season.id) } } as any, endAgain);
      expect(endAgain.status).toHaveBeenCalledWith(400);
    });
  });
});
