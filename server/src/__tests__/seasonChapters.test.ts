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
  startSeason,
  endSeason,
  runSeasonTick,
  getStandings,
  getTitles,
  getHallOfFame,
} from '../services/seasonService';
import {
  SEASON_THEMES,
  getActiveTheme,
  pickWeightedType,
} from '../services/seasonThemes';
import { EVENT_TYPES } from '../services/dynamicEventService';
import { getUniverseSeasons, getSeasonThemes, adminStartSeason } from '../controllers/seasonController';

describe('Season chapters (persistent world, themes, gain scoring)', () => {
  let universeId: number;
  let classicUniverseId: number;
  let richPlayerId: number;
  let midPlayerId: number;
  let poorPlayerId: number;

  const mockRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const tnn = async (uid: number): Promise<Array<{ subject: string; body: string }>> =>
    (await testPool.query(
      `SELECT subject, body FROM messages
       WHERE universe_id = $1 AND message_type = 'BROADCAST' AND sender_name = 'TerraCorp News Network'
       ORDER BY id ASC`,
      [uid]
    )).rows;

  const setHunter = async (playerId: number, credits: number, claimed: number) => {
    await testPool.query(
      `INSERT INTO bounty_hunters (player_id, bounties_claimed, bounty_credits_earned)
       VALUES ($1, $2, $3)
       ON CONFLICT (player_id) DO UPDATE SET bounties_claimed = $2, bounty_credits_earned = $3`,
      [playerId, claimed, credits]
    );
  };

  const addCredits = async (playerId: number, amount: number) => {
    await testPool.query(`UPDATE players SET credits = credits + $2 WHERE id = $1`, [playerId, amount]);
  };

  beforeAll(async () => {
    await cleanupTestDb();
    universeId = await createTestUniverse('Chapters Test Universe', 50);
    classicUniverseId = await createTestUniverse('Chapters Classic Universe', 50);
    await createTestSector(universeId, 20, 'Chapter Sector');

    const u1 = await createTestUser('test_chapter_rich');
    const u2 = await createTestUser('test_chapter_mid');
    const u3 = await createTestUser('test_chapter_poor');
    richPlayerId = await createTestPlayerWithStats(u1, universeId, 20, 900000, 10, 10, 100, 'Rich Corp');
    midPlayerId = await createTestPlayerWithStats(u2, universeId, 20, 50000, 10, 10, 100, 'Mid Corp');
    poorPlayerId = await createTestPlayerWithStats(u3, universeId, 20, 1000, 10, 10, 100, 'Poor Corp');
  });

  afterAll(async () => {
    await testPool.query(`DELETE FROM seasons WHERE universe_id IN ($1, $2)`, [universeId, classicUniverseId]);
    await testPool.query(`DELETE FROM bounty_hunters`);
    await testPool.query(`DELETE FROM messages WHERE universe_id IN ($1, $2)`, [universeId, classicUniverseId]);
    await cleanupTestDb();
    await closeTestPool();
  });

  beforeEach(async () => {
    await testPool.query(`DELETE FROM seasons WHERE universe_id IN ($1, $2)`, [universeId, classicUniverseId]);
    await testPool.query(`DELETE FROM bounty_hunters`);
    await testPool.query(`DELETE FROM messages WHERE universe_id IN ($1, $2)`, [universeId, classicUniverseId]);
    await testPool.query(`UPDATE players SET credits = 900000 WHERE id = $1`, [richPlayerId]);
    await testPool.query(`UPDATE players SET credits = 50000 WHERE id = $1`, [midPlayerId]);
    await testPool.query(`UPDATE players SET credits = 1000 WHERE id = $1`, [poorPlayerId]);
  });

  describe('event weighting', () => {
    const share = (theme: any) => {
      const counts: Record<string, number> = {};
      const N = 1000;
      for (let i = 0; i < N; i++) {
        const t = pickWeightedType(EVENT_TYPES, theme, i / N);
        counts[t] = (counts[t] || 0) + 1;
      }
      return (t: string) => (counts[t] || 0) / N;
    };

    it('classic stretches keep every event type equally likely', () => {
      const s = share(null);
      for (const t of EVENT_TYPES) expect(s(t)).toBeCloseTo(1 / EVENT_TYPES.length, 2);
    });

    it('Pirate Season makes flotillas 30%, salvage 20%, the rest 10% each', () => {
      const s = share(SEASON_THEMES.pirate_season);
      expect(s('pirate_flotilla')).toBeCloseTo(0.3, 2);
      expect(s('salvage_field')).toBeCloseTo(0.2, 2);
      for (const t of ['ion_storm', 'incursion', 'port_strike', 'trade_boom', 'contract']) {
        expect(s(t)).toBeCloseTo(0.1, 2);
      }
    });

    it('reads the running theme per universe, and none between chapters', async () => {
      expect(await getActiveTheme(universeId)).toBeNull();
      await startSeason(universeId, 30, undefined, 'pirate_season');
      expect((await getActiveTheme(universeId))?.key).toBe('pirate_season');
      expect(await getActiveTheme(classicUniverseId)).toBeNull();
    });
  });

  describe('starting a themed chapter', () => {
    it('names it, stores theme and gain scoring, snapshots everyone and announces the rules', async () => {
      const result = await startSeason(universeId, 30, undefined, 'pirate_season');
      expect(result.success).toBe(true);
      expect(result.season!.name).toBe('Season 1: Pirate Season');
      expect(result.season!.theme).toBe('pirate_season');
      expect(result.season!.themeName).toBe('Pirate Season');
      expect(result.season!.scoring).toBe('gain');

      const baselines = await testPool.query(
        `SELECT player_id, networth FROM season_baselines WHERE season_id = $1 ORDER BY player_id`,
        [result.season!.id]
      );
      expect(baselines.rows.map((r) => r.player_id).sort()).toEqual([richPlayerId, midPlayerId, poorPlayerId].sort());
      // 10 fighters x 100 + 10 shields x 50 = 1500 on top of credits.
      const rich = baselines.rows.find((r) => r.player_id === richPlayerId);
      expect(Number(rich.networth)).toBe(901500);

      const news = await tnn(universeId);
      expect(news[0].subject).toBe('Season 1: Pirate Season has begun');
      expect(news[0].body).toContain('Pirate flotillas');
      expect(news[0].body).toContain('Top Bounty Hunter');
      expect(news[0].body).toContain('Nothing resets');
      expect(news[0].body).not.toMatch(/[–—]/);
    });

    it('rejects an unknown theme', async () => {
      const result = await startSeason(universeId, 30, undefined, 'zombie_season');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown season theme');
    });

    it('starts a classic chapter with no theme', async () => {
      const result = await startSeason(universeId, 30);
      expect(result.season!.theme).toBeNull();
      expect(result.season!.name).toBe('Season 1');
      expect(result.season!.scoring).toBe('gain');
    });

    it('works through the admin handler with a theme', async () => {
      const res = mockRes();
      await adminStartSeason({ body: { universeId, durationDays: 30, theme: 'pirate_season' } } as any, res);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json.mock.calls[0][0].season.theme).toBe('pirate_season');
    });

    it('lists the available themes', async () => {
      const res = mockRes();
      await getSeasonThemes({} as any, res);
      const themes = res.json.mock.calls[0][0].themes;
      expect(themes).toEqual([expect.objectContaining({ key: 'pirate_season', name: 'Pirate Season' })]);
    });
  });

  describe('gain scoring', () => {
    it('ranks by net worth gained during the chapter, not by total net worth', async () => {
      const { season } = await startSeason(universeId, 30, undefined, 'pirate_season');
      await addCredits(poorPlayerId, 20000);
      await addCredits(midPlayerId, 5000);
      await addCredits(richPlayerId, 1000);

      await endSeason(season!.id);
      const standings = await getStandings(season!.id);
      expect(standings.map((s) => s.corpName)).toEqual(['Poor Corp', 'Mid Corp', 'Rich Corp']);
      expect(standings.map((s) => s.gain)).toEqual([20000, 5000, 1000]);
      expect(standings[2].networth).toBe(902500);

      const news = await tnn(universeId);
      expect(news[news.length - 1].body).toContain('Final standings by net worth gained: #1 Poor Corp');
    });

    it('a late joiner is snapshotted on the next tick and gains only what they earn', async () => {
      const { season } = await startSeason(universeId, 30, undefined, 'pirate_season');
      const u = await createTestUser('test_chapter_late');
      const lateId = await createTestPlayerWithStats(u, universeId, 20, 5000000, 10, 10, 100, 'Late Corp');
      try {
        await runSeasonTick();
        const base = await testPool.query(
          `SELECT networth FROM season_baselines WHERE season_id = $1 AND player_id = $2`,
          [season!.id, lateId]
        );
        expect(Number(base.rows[0].networth)).toBe(5001500);
        await addCredits(poorPlayerId, 100);

        await endSeason(season!.id);
        const standings = await getStandings(season!.id);
        expect(standings[0].corpName).toBe('Poor Corp');
        expect(standings.find((s) => s.corpName === 'Late Corp')!.gain).toBe(0);
      } finally {
        await testPool.query(`DELETE FROM season_standings WHERE player_id = $1`, [lateId]);
        await testPool.query(`DELETE FROM season_baselines WHERE player_id = $1`, [lateId]);
        await testPool.query(`DELETE FROM players WHERE id = $1`, [lateId]);
      }
    });

    it('a Season 1 style chapter (networth scoring) still archives by total net worth', async () => {
      const inserted = await testPool.query(
        `INSERT INTO seasons (universe_id, season_number, name, status, ends_at)
         VALUES ($1, 1, 'Season 1', 'active', NOW() + INTERVAL '1 day') RETURNING id`,
        [universeId]
      );
      await addCredits(poorPlayerId, 20000);
      await endSeason(inserted.rows[0].id);
      const standings = await getStandings(inserted.rows[0].id);
      expect(standings[0].corpName).toBe('Rich Corp');
      expect(standings[0].gain).toBeNull();
    });
  });

  describe('Top Bounty Hunter', () => {
    it('goes to the most bounty credits earned during the chapter, not lifetime', async () => {
      // Rich Corp hunted a lot before the chapter began.
      await setHunter(richPlayerId, 100000, 10);
      const { season } = await startSeason(universeId, 30, undefined, 'pirate_season');
      await setHunter(richPlayerId, 110000, 11); // +10,000 this chapter
      await setHunter(midPlayerId, 24000, 2); // +24,000 this chapter

      await endSeason(season!.id);
      const titles = await getTitles(season!.id);
      expect(titles).toEqual([
        expect.objectContaining({ titleKey: 'top_bounty_hunter', titleLabel: 'Top Bounty Hunter', corpName: 'Mid Corp', value: 24000 }),
      ]);

      const hall = await getHallOfFame(universeId);
      expect(hall[0].titles[0].corpName).toBe('Mid Corp');

      const news = await tnn(universeId);
      expect(news[news.length - 1].body).toContain('Top Bounty Hunter: Mid Corp with 24,000 bounty credits.');
    });

    it('breaks a tie on bounties claimed during the chapter', async () => {
      const { season } = await startSeason(universeId, 30, undefined, 'pirate_season');
      await setHunter(richPlayerId, 10000, 1);
      await setHunter(poorPlayerId, 10000, 3);
      await endSeason(season!.id);
      expect((await getTitles(season!.id))[0].corpName).toBe('Poor Corp');
    });

    it('is skipped, and TNN says so, when nobody hunted', async () => {
      const { season } = await startSeason(universeId, 30, undefined, 'pirate_season');
      await endSeason(season!.id);
      expect(await getTitles(season!.id)).toEqual([]);
      const news = await tnn(universeId);
      expect(news[news.length - 1].body).toContain('Nobody earned the Top Bounty Hunter title this season.');
    });

    it('classic chapters award no titles', async () => {
      const { season } = await startSeason(universeId, 30);
      await setHunter(midPlayerId, 50000, 5);
      await endSeason(season!.id);
      expect(await getTitles(season!.id)).toEqual([]);
    });
  });

  describe('live view', () => {
    it('shows This Season gains and the title race', async () => {
      await startSeason(universeId, 30, undefined, 'pirate_season');
      await addCredits(midPlayerId, 7000);
      await setHunter(poorPlayerId, 9000, 1);

      const res = mockRes();
      await getUniverseSeasons({ params: { universeId: String(universeId) } } as any, res);
      const body = res.json.mock.calls[0][0];
      expect(body.current.themeName).toBe('Pirate Season');
      expect(body.live.gains[0]).toEqual(expect.objectContaining({ corpName: 'Mid Corp', gain: 7000 }));
      expect(body.live.titleRaces[0].titleLabel).toBe('Top Bounty Hunter');
      expect(body.live.titleRaces[0].leaders[0]).toEqual(expect.objectContaining({ corpName: 'Poor Corp', value: 9000 }));
    });
  });

  describe('fairness: chapters never touch player assets', () => {
    it('start and end leave every player exactly as they were', async () => {
      const before = await Promise.all([richPlayerId, midPlayerId, poorPlayerId].map(getPlayer));
      const { season } = await startSeason(universeId, 30, undefined, 'pirate_season');
      await endSeason(season!.id);
      const after = await Promise.all([richPlayerId, midPlayerId, poorPlayerId].map(getPlayer));
      expect(after).toEqual(before);
    });
  });
});
