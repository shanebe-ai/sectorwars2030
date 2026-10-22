import {
  getTestPool,
  cleanupTestDb,
  createTestUser,
  createTestUniverse,
  createTestSector,
  createWarp,
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

import {
  createEvent,
  advanceEvents,
  forceStartEvent,
  forceResolveEvent,
} from '../services/dynamicEventService';
import { adminForceStart } from '../controllers/eventController';

describe('Salvage Field dynamic event', () => {
  let testUserId: number;
  let testUniverseId: number;
  let testPlayerId: number;

  // One long chain of sectors 11 to 40 so a warp walk from any seed
  // outside TerraSpace can always build a full region. TerraSpace
  // sectors hang off the chain so a slipped guard would show up.
  // Sector 22 carries a port: regions may include it, spawns may not.
  const PORT_SECTOR = 22;
  const REGION = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

  const sectorId = async (n: number): Promise<number> =>
    (await testPool.query(
      `SELECT id FROM sectors WHERE universe_id = $1 AND sector_number = $2`,
      [testUniverseId, n]
    )).rows[0].id;

  const link = async (a: number, b: number) => {
    await createWarp(await sectorId(a), b, true);
    await createWarp(await sectorId(b), a, true);
  };

  const insertField = async (
    state: 'brewing' | 'active',
    sectors: number[],
    derelictCount: number,
    overrides: { brewingEnds?: string; activeEnds?: string } = {}
  ): Promise<number> => {
    const res = await testPool.query(
      `INSERT INTO dynamic_events
         (universe_id, type, state, region_sectors, brewing_ends_at, active_ends_at, params)
       VALUES ($1, 'salvage_field', $2, $3,
          ${overrides.brewingEnds || `NOW() + INTERVAL '30 minutes'`},
          ${overrides.activeEnds || `NOW() + INTERVAL '3 hours'`},
          $4)
       RETURNING id`,
      [testUniverseId, state, JSON.stringify(sectors), JSON.stringify({ derelictCount })]
    );
    return res.rows[0].id;
  };

  const insertDerelict = async (sectorNumber: number, eventId: number | null) => {
    const res = await testPool.query(
      `INSERT INTO derelicts (universe_id, sector_number, type, state, loot, expires_at, event_id)
       VALUES ($1, $2, 'wreck', 'spotted', '{}', NOW() + INTERVAL '20 hours', $3)
       RETURNING id`,
      [testUniverseId, sectorNumber, eventId]
    );
    return res.rows[0].id as number;
  };

  const eventDerelicts = async (eventId: number) =>
    (await testPool.query(
      `SELECT id, sector_number, state FROM derelicts WHERE event_id = $1 ORDER BY sector_number`,
      [eventId]
    )).rows;

  const withClient = async <T>(fn: (client: any) => Promise<T>): Promise<T> => {
    const client = await testPool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  };

  const mockRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeAll(async () => {
    await testPool.query(`DELETE FROM dynamic_events`);
    await testPool.query(`DELETE FROM dynamic_event_settings`);
    await cleanupTestDb();

    testUserId = await createTestUser('test_salvage_user');
    testUniverseId = await createTestUniverse('Salvage Field Test Universe', 100);

    for (let s = 1; s <= 40; s++) {
      await createTestSector(testUniverseId, s, `Salvage Sector ${s}`);
    }
    for (let s = 11; s < 40; s++) {
      await link(s, s + 1);
    }
    for (let s = 1; s < 10; s++) {
      await link(s, s + 1);
    }
    await link(15, 5);
    await link(16, 3);
    await link(20, 9);

    await testPool.query(
      `UPDATE sectors
       SET port_type = 'BBB', port_class = 4,
           port_fuel_qty = 5000, port_organics_qty = 5000, port_equipment_qty = 5000,
           port_fuel_pct = 100, port_organics_pct = 100, port_equipment_pct = 100
       WHERE universe_id = $1 AND sector_number = $2`,
      [testUniverseId, PORT_SECTOR]
    );

    testPlayerId = await createTestPlayerWithStats(
      testUserId,
      testUniverseId,
      15,
      50000,
      100,
      500,
      100
    );
  });

  afterAll(async () => {
    await testPool.query(`DELETE FROM derelicts WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM dynamic_events`);
    await testPool.query(`DELETE FROM dynamic_event_settings`);
    await cleanupTestDb();
    await closeTestPool();
  });

  beforeEach(async () => {
    await testPool.query(`DELETE FROM derelicts WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM dynamic_events WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM dynamic_event_settings WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM messages WHERE universe_id = $1`, [testUniverseId]);
  });

  describe('Creation', () => {
    it('builds a region of 4 to 8 linked sectors that never includes TerraSpace', async () => {
      for (let i = 0; i < 10; i++) {
        await testPool.query(`DELETE FROM dynamic_events WHERE universe_id = $1`, [testUniverseId]);
        const event = await withClient((client) => createEvent(client, testUniverseId, 'salvage_field'));
        expect(event).not.toBeNull();
        expect(event!.state).toBe('brewing');
        expect(event!.regionSectors.length).toBeGreaterThanOrEqual(4);
        expect(event!.regionSectors.length).toBeLessThanOrEqual(8);
        expect(event!.regionSectors.every((n) => n > 10)).toBe(true);
        expect(new Set(event!.regionSectors).size).toBe(event!.regionSectors.length);
        expect(event!.params.derelictCount).toBeGreaterThanOrEqual(5);
        expect(event!.params.derelictCount).toBeLessThanOrEqual(8);
      }
    });

    it('announces the forecast on TNN with the region and no dashes', async () => {
      const event = await withClient((client) =>
        createEvent(client, testUniverseId, 'salvage_field', { brewingMinutes: 30 })
      );
      const msgs = await testPool.query(
        `SELECT subject, body FROM messages WHERE universe_id = $1 AND message_type = 'BROADCAST'`,
        [testUniverseId]
      );
      expect(msgs.rows.length).toBe(1);
      expect(msgs.rows[0].subject).toMatch(/Salvage/);
      expect(msgs.rows[0].body).toMatch(/30 minutes/);
      expect(msgs.rows[0].body).toContain(event!.regionSectors.join(', '));
      expect(msgs.rows[0].body).not.toMatch(/[\u2013\u2014]/);
    });

    it('works through the admin force start endpoint', async () => {
      const req = { body: { universeId: testUniverseId, type: 'salvage_field' } } as any;
      const res = mockRes();
      await adminForceStart(req, res);
      expect(res.status).not.toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.event.type).toBe('salvage_field');
    });
  });

  describe('Spawning', () => {
    it('spawns nothing while the event is brewing', async () => {
      const event = await withClient((client) => createEvent(client, testUniverseId, 'salvage_field'));
      expect(event).not.toBeNull();
      expect(await eventDerelicts(event!.id)).toEqual([]);
      const total = await testPool.query(
        `SELECT COUNT(*) AS count FROM derelicts WHERE universe_id = $1`,
        [testUniverseId]
      );
      expect(parseInt(total.rows[0].count, 10)).toBe(0);
    });

    it('spawns the rolled count of derelicts inside the region on activation', async () => {
      const id = await insertField('brewing', REGION, 7, {
        brewingEnds: `NOW() - INTERVAL '1 minute'`,
      });
      await withClient((client) => advanceEvents(client));

      const row = await testPool.query(`SELECT state, params FROM dynamic_events WHERE id = $1`, [id]);
      expect(row.rows[0].state).toBe('active');
      expect(row.rows[0].params.spawnedDerelicts).toBe(7);

      const spawned = await eventDerelicts(id);
      expect(spawned.length).toBe(7);
      expect(spawned.length).toBeGreaterThanOrEqual(5);
      expect(spawned.length).toBeLessThanOrEqual(8);
      for (const d of spawned) {
        expect(REGION).toContain(d.sector_number);
        expect(d.sector_number).toBeGreaterThan(10);
        expect(d.state).toBe('spotted');
      }
      // The port sector is in the region but never receives a derelict.
      expect(spawned.map((d) => d.sector_number)).not.toContain(PORT_SECTOR);
    });
  });

  describe('Cleanup', () => {
    it('sweeps untouched event derelicts and leaves everything else alone', async () => {
      const preExistingInRegion = await insertDerelict(16, null);
      const preExistingOutside = await insertDerelict(35, null);
      const id = await insertField('brewing', REGION, 6, {
        brewingEnds: `NOW() - INTERVAL '1 minute'`,
      });

      await withClient((client) => advanceEvents(client));
      const spawned = await eventDerelicts(id);
      expect(spawned.length).toBe(6);
      // The pre existing derelict blocked its sector from spawning.
      expect(spawned.map((d) => d.sector_number)).not.toContain(16);

      // One derelict gets claimed outright, another is mid boarding.
      const claimedId = spawned[0].id;
      const boardedId = spawned[1].id;
      await testPool.query(
        `UPDATE derelicts SET state = 'claimed', claimed_by = $1 WHERE id = $2`,
        [testPlayerId, claimedId]
      );
      await testPool.query(
        `UPDATE derelicts SET state = 'boarded' WHERE id = $1`,
        [boardedId]
      );

      await testPool.query(
        `UPDATE dynamic_events SET active_ends_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
        [id]
      );
      await withClient((client) => advanceEvents(client));

      const row = await testPool.query(`SELECT state FROM dynamic_events WHERE id = $1`, [id]);
      expect(row.rows[0].state).toBe('resolved');

      const remaining = await eventDerelicts(id);
      expect(remaining.map((d) => d.id).sort()).toEqual([claimedId, boardedId].sort());

      const survivors = await testPool.query(
        `SELECT id FROM derelicts WHERE id = ANY($1)`,
        [[preExistingInRegion, preExistingOutside]]
      );
      expect(survivors.rows.length).toBe(2);
    });

    it('force resolves cleanly from the admin path', async () => {
      const event = await forceStartEvent(testUniverseId, 'salvage_field');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('salvage_field');
      expect(await forceResolveEvent(event!.id)).toBe(true);
      const row = await testPool.query(`SELECT state FROM dynamic_events WHERE id = $1`, [event!.id]);
      expect(row.rows[0].state).toBe('resolved');
    });
  });
});
