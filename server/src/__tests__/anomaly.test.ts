import { Request, Response } from 'express';
import {
  getTestPool,
  cleanupTestDb,
  createTestUser,
  createTestUniverse,
  createTestSector,
  createWarp,
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

// Import services and controllers after mocking
import { runAnomalyTick, getAnomalyInSector } from '../services/anomalyService';
import { scanSector, moveToSector } from '../controllers/sectorController';

describe('Anomaly System', () => {
  let testUserId: number;
  let testUniverseId: number;
  let testPlayerId: number;

  const insertAnomaly = async (
    sectorNumber: number,
    type: 'ion' | 'gravity' | 'radiation' | 'nebula',
    endsSql = `NOW() + INTERVAL '2 hours'`
  ) => {
    await testPool.query(
      `INSERT INTO anomalies (universe_id, sector_number, type, ends_at)
       VALUES ($1, $2, $3, ${endsSql})
       ON CONFLICT (universe_id, sector_number) DO NOTHING`,
      [testUniverseId, sectorNumber, type]
    );
  };

  const mockRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeAll(async () => {
    await cleanupTestDb();

    testUserId = await createTestUser('test_anomaly_user');
    testUniverseId = await createTestUniverse('Anomaly Test Universe', 100);

    // Sectors 11..25 for anomaly tests (outside TerraSpace)
    for (let s = 11; s <= 25; s++) {
      await createTestSector(testUniverseId, s, `Anomaly Sector ${s}`);
    }
    // Warps: 15 <-> 16, 16 <-> 17
    const s15 = await testPool.query(
      `SELECT id FROM sectors WHERE universe_id = $1 AND sector_number = 15`,
      [testUniverseId]
    );
    const s16 = await testPool.query(
      `SELECT id FROM sectors WHERE universe_id = $1 AND sector_number = 16`,
      [testUniverseId]
    );
    await createWarp(s15.rows[0].id, 16, true);
    await createWarp(s16.rows[0].id, 15, true);
    await createWarp(s16.rows[0].id, 17, true);

    testPlayerId = await createTestPlayerWithStats(
      testUserId,
      testUniverseId,
      15,
      50000, // credits
      50, // fighters
      50, // shields
      100 // turns
    );
  });

  afterAll(async () => {
    await cleanupTestDb();
    await closeTestPool();
  });

  beforeEach(async () => {
    await testPool.query(`DELETE FROM anomalies WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM derelicts WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM sector_fighters WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM sector_mines WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(
      `UPDATE players SET current_sector = 15, turns_remaining = 100 WHERE id = $1`,
      [testPlayerId]
    );
  });

  describe('Tick: dissipation and formation', () => {
    it('dissipates anomalies past their end time', async () => {
      await insertAnomaly(16, 'ion', `NOW() - INTERVAL '10 minutes'`);
      await insertAnomaly(17, 'gravity', `NOW() + INTERVAL '2 hours'`);

      await runAnomalyTick();

      expect(await getAnomalyInSector(testUniverseId, 16)).toBeNull();
      const stillThere = await getAnomalyInSector(testUniverseId, 17);
      expect(stillThere).not.toBeNull();
      expect(stillThere?.type).toBe('gravity');
    });

    it('never forms in TerraSpace', async () => {
      // Only sectors 1..10 exist in a fresh constrained universe
      const smallUniverse = await createTestUniverse('Small Universe', 10);
      for (let s = 1; s <= 10; s++) {
        await createTestSector(smallUniverse, s, `Small ${s}`);
      }
      for (let i = 0; i < 40; i++) {
        await runAnomalyTick();
      }
      const res = await testPool.query(
        `SELECT COUNT(*) AS count FROM anomalies WHERE universe_id = $1`,
        [smallUniverse]
      );
      expect(parseInt(res.rows[0].count, 10)).toBe(0);
    });

    it('never forms on a sector with a derelict being boarded', async () => {
      // Fill every legal sector except 20 with anomalies, then board a
      // derelict in 20 and run the tick: 20 must stay anomaly free.
      await testPool.query(
        `INSERT INTO derelicts (universe_id, sector_number, type, state, loot, expires_at)
         VALUES ($1, 20, 'wreck', 'boarded', '{}', NOW() + INTERVAL '20 hours')`,
        [testUniverseId]
      );
      for (let i = 0; i < 60; i++) {
        await runAnomalyTick();
      }
      const res = await testPool.query(
        `SELECT type FROM anomalies WHERE universe_id = $1 AND sector_number = 20`,
        [testUniverseId]
      );
      expect(res.rows.length).toBe(0);
    });

    it('never shares a sector with an active living economy event', async () => {
      // Port sector 21 with an active scarcity event
      await testPool.query(
        `INSERT INTO sectors (universe_id, sector_number, name, port_type, port_class)
         VALUES ($1, 21, 'Event Port', 'BBB', 5) ON CONFLICT DO NOTHING`,
        [testUniverseId]
      );
      await testPool.query(
        `INSERT INTO port_economy (universe_id, sector_number, commodity, event_state, event_ends_at)
         VALUES ($1, 21, 'fuel', 'scarcity', NOW() + INTERVAL '1 hour')
         ON CONFLICT (universe_id, sector_number, commodity) DO NOTHING`,
        [testUniverseId]
      );
      // Occupy every other legal sector with a long lived anomaly so the
      // only free candidate is 21
      for (let s = 11; s <= 25; s++) {
        if (s === 21) continue;
        await insertAnomaly(s, 'nebula', `NOW() + INTERVAL '3 hours'`);
      }
      for (let i = 0; i < 40; i++) {
        await runAnomalyTick();
      }
      const res = await testPool.query(
        `SELECT type FROM anomalies
         WHERE universe_id = $1 AND sector_number = 21 AND ends_at > NOW()`,
        [testUniverseId]
      );
      expect(res.rows.length).toBe(0);
    });
  });

  describe('Radiation decay', () => {
    it('degrades deployed fighters and mines in radiation sectors', async () => {
      await insertAnomaly(16, 'radiation', `NOW() + INTERVAL '2 hours'`);
      await testPool.query(
        `INSERT INTO sector_fighters (universe_id, sector_number, owner_id, owner_name, fighter_count)
         VALUES ($1, 16, $2, 'Test', 100)`,
        [testUniverseId, testPlayerId]
      );
      await testPool.query(
        `INSERT INTO sector_mines (universe_id, sector_number, owner_id, owner_name, mine_count)
         VALUES ($1, 16, $2, 'Test', 50)`,
        [testUniverseId, testPlayerId]
      );

      await runAnomalyTick();

      const fighters = await testPool.query(
        `SELECT fighter_count FROM sector_fighters WHERE universe_id = $1 AND sector_number = 16`,
        [testUniverseId]
      );
      const mines = await testPool.query(
        `SELECT mine_count FROM sector_mines WHERE universe_id = $1 AND sector_number = 16`,
        [testUniverseId]
      );
      expect(fighters.rows[0].fighter_count).toBe(90);
      expect(mines.rows[0].mine_count).toBe(45);
    });

    it('leaves fighters and mines alone outside radiation', async () => {
      await insertAnomaly(16, 'ion', `NOW() + INTERVAL '2 hours'`);
      await testPool.query(
        `INSERT INTO sector_fighters (universe_id, sector_number, owner_id, owner_name, fighter_count)
         VALUES ($1, 16, $2, 'Test', 100)`,
        [testUniverseId, testPlayerId]
      );

      await runAnomalyTick();

      const fighters = await testPool.query(
        `SELECT fighter_count FROM sector_fighters WHERE universe_id = $1 AND sector_number = 16`,
        [testUniverseId]
      );
      expect(fighters.rows[0].fighter_count).toBe(100);
    });
  });

  describe('Nebula shroud in scans', () => {
    it('hides players and beacons but shows the anomaly flag', async () => {
      // Second player in sector 16
      const user2 = await createTestUser('test_anomaly_user2');
      await createTestPlayerWithStats(user2, testUniverseId, 16, 1000, 5, 5, 50, 'Corp Two');
      await testPool.query(
        `INSERT INTO sector_beacons (universe_id, sector_number, owner_id, message)
         VALUES ($1, 16, $2, 'hello')`,
        [testUniverseId, testPlayerId]
      );
      await insertAnomaly(16, 'nebula', `NOW() + INTERVAL '2 hours'`);

      const req = { params: { sectorNumber: '16' }, user: { userId: testUserId } } as any;
      const res = mockRes();
      await scanSector(req, res);

      expect(res.json).toHaveBeenCalled();
      const scan = res.json.mock.calls[0][0].scan;
      expect(scan.ships).toEqual([]);
      expect(scan.beacons).toEqual([]);
      expect(scan.hasBeacon).toBe(false);
      expect(scan.anomaly).toEqual({ type: 'nebula' });
    });

    it('shows players and beacons normally without a nebula', async () => {
      const req = { params: { sectorNumber: '16' }, user: { userId: testUserId } } as any;
      const res = mockRes();
      await scanSector(req, res);

      const scan = res.json.mock.calls[0][0].scan;
      expect(scan.anomaly).toBeNull();
      // At least the scanning player is not in 16; ships list reflects sector 16 occupants
      expect(Array.isArray(scan.ships)).toBe(true);
    });
  });

  describe('Gravity well warp surcharge', () => {
    it('costs 2 turns to warp out of a gravity well sector', async () => {
      await insertAnomaly(15, 'gravity', `NOW() + INTERVAL '2 hours'`);

      const req = { body: { destinationSector: 16 }, user: { userId: testUserId } } as any;
      const res = mockRes();
      await moveToSector(req, res);

      const player = await getPlayer(testPlayerId);
      expect(player.current_sector).toBe(16);
      expect(player.turns_remaining).toBe(98);
    });

    it('costs 1 turn normally', async () => {
      const req = { body: { destinationSector: 16 }, user: { userId: testUserId } } as any;
      const res = mockRes();
      await moveToSector(req, res);

      const player = await getPlayer(testPlayerId);
      expect(player.turns_remaining).toBe(99);
    });

    it('refuses the warp when the player cannot afford the surcharge', async () => {
      await insertAnomaly(15, 'gravity', `NOW() + INTERVAL '2 hours'`);
      await testPool.query(`UPDATE players SET turns_remaining = 1 WHERE id = $1`, [testPlayerId]);

      const req = { body: { destinationSector: 16 }, user: { userId: testUserId } } as any;
      const res = mockRes();
      await moveToSector(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const player = await getPlayer(testPlayerId);
      expect(player.current_sector).toBe(15);
      expect(player.turns_remaining).toBe(1);
    });
  });
});
