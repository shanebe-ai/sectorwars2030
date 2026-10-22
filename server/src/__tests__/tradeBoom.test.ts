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

import {
  createEvent,
  advanceEvents,
  applyTradeBoom,
  getTradeBoomBonus,
  getEventsForSector,
  forceStartEvent,
  forceResolveEvent,
  TRADE_BOOM_BONUS,
} from '../services/dynamicEventService';
import { getPortInfo, executeTrade } from '../services/portService';
import { adminForceStart } from '../controllers/eventController';

describe('Trade Boom dynamic event', () => {
  let testUserId: number;
  let testUniverseId: number;
  let testPlayerId: number;

  // Sector 15 is a BBS port (buys fuel and organics, sells equipment).
  // Sector 17 is an SSB port (buys equipment). Sector 5 is a TerraSpace
  // BBB port wired straight into the boom area, so a region walk would
  // reach TerraSpace if the guard ever slipped. Sector 40 is a BBS port
  // on its own chain, outside any region seeded from 15 or 17.
  const BOOM_PORT = 15;
  const OTHER_PORT = 17;
  const OUTSIDE_PORT = 40;

  const sectorId = async (n: number): Promise<number> =>
    (await testPool.query(
      `SELECT id FROM sectors WHERE universe_id = $1 AND sector_number = $2`,
      [testUniverseId, n]
    )).rows[0].id;

  const link = async (a: number, b: number) => {
    await createWarp(await sectorId(a), b, true);
    await createWarp(await sectorId(b), a, true);
  };

  const setPort = async (n: number, type: string) => {
    await testPool.query(
      `UPDATE sectors
       SET port_type = $1, port_class = 4,
           port_fuel_qty = 5000, port_organics_qty = 5000, port_equipment_qty = 5000,
           port_fuel_pct = 100, port_organics_pct = 100, port_equipment_pct = 100
       WHERE universe_id = $2 AND sector_number = $3`,
      [type, testUniverseId, n]
    );
  };

  const insertBoom = async (
    state: 'brewing' | 'active' | 'resolved',
    sectors: number[],
    commodity: string,
    overrides: { brewingEnds?: string; activeEnds?: string } = {}
  ): Promise<number> => {
    const res = await testPool.query(
      `INSERT INTO dynamic_events
         (universe_id, type, state, region_sectors, brewing_ends_at, active_ends_at, params)
       VALUES ($1, 'trade_boom', $2, $3,
          ${overrides.brewingEnds || `NOW() + INTERVAL '30 minutes'`},
          ${overrides.activeEnds || `NOW() + INTERVAL '3 hours'`},
          $4)
       RETURNING id`,
      [testUniverseId, state, JSON.stringify(sectors), JSON.stringify({ commodity, bonus: TRADE_BOOM_BONUS })]
    );
    return res.rows[0].id;
  };

  const setEconomy = async (n: number, commodity: string, drift: number, eventState = 'none') => {
    await testPool.query(
      `INSERT INTO port_economy (universe_id, sector_number, commodity, drift, event_state, event_ends_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '1 hour')
       ON CONFLICT (universe_id, sector_number, commodity)
       DO UPDATE SET drift = EXCLUDED.drift, event_state = EXCLUDED.event_state,
                     event_ends_at = EXCLUDED.event_ends_at`,
      [testUniverseId, n, commodity, drift, eventState]
    );
  };

  const prices = async (n: number) => {
    const info = await getPortInfo(testUserId, n);
    if (!info) throw new Error(`No port at ${n}`);
    return {
      fuel: info.commodities.fuel.price,
      organics: info.commodities.organics.price,
      equipment: info.commodities.equipment.price,
    };
  };

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

    testUserId = await createTestUser('test_boom_user');
    testUniverseId = await createTestUniverse('Trade Boom Test Universe', 100);

    for (let s = 1; s <= 40; s++) {
      await createTestSector(testUniverseId, s, `Boom Sector ${s}`);
    }

    // A chain 15 - 16 - ... - 30, with TerraSpace sectors hanging off it.
    for (let s = 15; s < 30; s++) {
      await link(s, s + 1);
    }
    await link(15, 5);
    await link(16, 3);
    await link(20, 9);
    for (let s = 1; s < 10; s++) {
      await link(s, s + 1);
    }
    // A separate chain 31 - ... - 40 around the outside port.
    for (let s = 31; s < 40; s++) {
      await link(s, s + 1);
    }

    await setPort(BOOM_PORT, 'BBS');
    await setPort(OTHER_PORT, 'SSB');
    await setPort(OUTSIDE_PORT, 'BBS');
    await setPort(5, 'BBB');

    testPlayerId = await createTestPlayerWithStats(
      testUserId,
      testUniverseId,
      BOOM_PORT,
      50000,
      100,
      500,
      100
    );
  });

  afterAll(async () => {
    await testPool.query(`DELETE FROM dynamic_events`);
    await testPool.query(`DELETE FROM dynamic_event_settings`);
    await testPool.query(`DELETE FROM port_economy`);
    await cleanupTestDb();
    await closeTestPool();
  });

  beforeEach(async () => {
    await testPool.query(`DELETE FROM dynamic_events WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM dynamic_event_settings WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM port_economy WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(
      `UPDATE players SET current_sector = $1, turns_remaining = 100, credits = 50000,
              ship_fighters = 100, ship_shields = 500,
              cargo_fuel = 50, cargo_organics = 0, cargo_equipment = 0
       WHERE id = $2`,
      [BOOM_PORT, testPlayerId]
    );
    await setPort(BOOM_PORT, 'BBS');
    jest.restoreAllMocks();
  });

  describe('Creation', () => {
    it('builds a region of linked sectors that never includes TerraSpace', async () => {
      for (let i = 0; i < 10; i++) {
        await testPool.query(`DELETE FROM dynamic_events WHERE universe_id = $1`, [testUniverseId]);
        const event = await withClient((client) => createEvent(client, testUniverseId, 'trade_boom'));
        expect(event).not.toBeNull();
        expect(event!.state).toBe('brewing');
        expect(event!.regionSectors.length).toBeGreaterThanOrEqual(8);
        expect(event!.regionSectors.length).toBeLessThanOrEqual(15);
        expect(event!.regionSectors.every((n) => n > 10)).toBe(true);
        expect(new Set(event!.regionSectors).size).toBe(event!.regionSectors.length);
      }
    });

    it('booms a commodity the seed port actually buys', async () => {
      for (let i = 0; i < 10; i++) {
        await testPool.query(`DELETE FROM dynamic_events WHERE universe_id = $1`, [testUniverseId]);
        const event = await withClient((client) => createEvent(client, testUniverseId, 'trade_boom'));
        const seed = event!.regionSectors[0];
        const portType = seed === OTHER_PORT ? 'SSB' : 'BBS';
        const letters = portType.split('');
        const bought = ['fuel', 'organics', 'equipment'].filter((_, idx) => letters[idx] === 'B');
        expect([BOOM_PORT, OTHER_PORT, OUTSIDE_PORT]).toContain(seed);
        expect(bought).toContain(event!.params.commodity);
        expect(event!.params.bonus).toBe(TRADE_BOOM_BONUS);
      }
    });

    it('announces the forecast on TNN with the commodity, region, and start time', async () => {
      await testPool.query(`DELETE FROM messages WHERE universe_id = $1`, [testUniverseId]);
      const event = await withClient((client) =>
        createEvent(client, testUniverseId, 'trade_boom', { brewingMinutes: 30 })
      );
      const msgs = await testPool.query(
        `SELECT subject, body FROM messages WHERE universe_id = $1 AND message_type = 'BROADCAST'`,
        [testUniverseId]
      );
      expect(msgs.rows.length).toBe(1);
      expect(msgs.rows[0].subject).toMatch(/Boom/);
      expect(msgs.rows[0].body).toMatch(/30 minutes/);
      expect(msgs.rows[0].body).toContain(event!.regionSectors.join(', '));
      expect(msgs.rows[0].body).not.toMatch(/[\u2013\u2014]/);
    });

    it('works through the admin force start endpoint', async () => {
      const req = { body: { universeId: testUniverseId, type: 'trade_boom' } } as any;
      const res = mockRes();
      await adminForceStart(req, res);
      expect(res.status).not.toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.event.type).toBe('trade_boom');
    });
  });

  describe('Pricing', () => {
    it('has no price effect while brewing', async () => {
      const before = await prices(BOOM_PORT);
      await insertBoom('brewing', [BOOM_PORT, 16], 'fuel');
      expect(await getTradeBoomBonus(testUniverseId, BOOM_PORT, 'fuel')).toBe(0);
      expect(await prices(BOOM_PORT)).toEqual(before);
    });

    it('raises what the port pays for the boomed commodity by 30% when active', async () => {
      const before = await prices(BOOM_PORT);
      await insertBoom('active', [BOOM_PORT, 16], 'fuel');
      const after = await prices(BOOM_PORT);
      expect(after.fuel / before.fuel).toBeCloseTo(1.3, 1);
      // Other commodities, including what the port sells, are untouched.
      expect(after.organics).toBe(before.organics);
      expect(after.equipment).toBe(before.equipment);
    });

    it('leaves ports outside the region alone', async () => {
      const before = await prices(OUTSIDE_PORT);
      await insertBoom('active', [BOOM_PORT, 16], 'fuel');
      expect(await prices(OUTSIDE_PORT)).toEqual(before);
    });

    it('keeps boom plus drift inside the 40% bound', async () => {
      const base = await prices(BOOM_PORT);
      await setEconomy(BOOM_PORT, 'fuel', 0.3);
      await insertBoom('active', [BOOM_PORT], 'fuel');
      const after = await prices(BOOM_PORT);
      // Neutral price times 1.4, never 1.6.
      expect(Math.abs(after.fuel - base.fuel * 1.4)).toBeLessThanOrEqual(1);
      expect(after.fuel).toBeLessThan(base.fuel * 1.5);
      expect(applyTradeBoom(0.3, 'none', 0.3)).toBeCloseTo(0.4);
      expect(applyTradeBoom(0.4, 'none', 0.3)).toBeCloseTo(0.4);
      expect(applyTradeBoom(-0.4, 'none', 0.3)).toBeCloseTo(-0.1);
      expect(applyTradeBoom(0, 'none', 0.3)).toBeCloseTo(0.3);
    });

    it('skips ports already in a scarcity or surplus state', async () => {
      await insertBoom('active', [BOOM_PORT], 'fuel');
      for (const state of ['scarcity', 'surplus']) {
        await setEconomy(BOOM_PORT, 'fuel', 0.1, state);
        const withBoom = await prices(BOOM_PORT);
        await testPool.query(`DELETE FROM dynamic_events WHERE universe_id = $1`, [testUniverseId]);
        const withoutBoom = await prices(BOOM_PORT);
        expect(withBoom.fuel).toBe(withoutBoom.fuel);
        await insertBoom('active', [BOOM_PORT], 'fuel');
      }
      expect(applyTradeBoom(0.1, 'scarcity', 0.3)).toBeCloseTo(0.1);
      expect(applyTradeBoom(0.1, 'surplus', 0.3)).toBeCloseTo(0.1);
    });

    it('pays the boomed price on an actual sale, matching the quote', async () => {
      await insertBoom('active', [BOOM_PORT], 'fuel');
      const quote = (await prices(BOOM_PORT)).fuel;
      const result = await executeTrade(testUserId, 'fuel', 'sell', 10);
      expect(result.success).toBe(true);
      expect(result.totalCost).toBe(quote * 10);
    });
  });

  describe('Lifecycle and cleanup', () => {
    it('runs brewing, active, resolved and removes the modifier completely', async () => {
      const base = await prices(BOOM_PORT);
      const id = await insertBoom('brewing', [BOOM_PORT, 16], 'fuel', {
        brewingEnds: `NOW() - INTERVAL '1 minute'`,
      });

      await withClient((client) => advanceEvents(client));
      let row = await testPool.query(`SELECT state FROM dynamic_events WHERE id = $1`, [id]);
      expect(row.rows[0].state).toBe('active');
      expect((await prices(BOOM_PORT)).fuel).toBeGreaterThan(base.fuel);

      await testPool.query(
        `UPDATE dynamic_events SET active_ends_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
        [id]
      );
      await withClient((client) => advanceEvents(client));
      row = await testPool.query(`SELECT state FROM dynamic_events WHERE id = $1`, [id]);
      expect(row.rows[0].state).toBe('resolved');

      expect(await prices(BOOM_PORT)).toEqual(base);
      expect(await getTradeBoomBonus(testUniverseId, BOOM_PORT, 'fuel')).toBe(0);
      // The boom never writes into the living economy.
      const econ = await testPool.query(
        `SELECT COUNT(*) AS count FROM port_economy WHERE universe_id = $1`,
        [testUniverseId]
      );
      expect(parseInt(econ.rows[0].count, 10)).toBe(0);
    });

    it('force resolves cleanly from the admin path', async () => {
      const base = await prices(BOOM_PORT);
      const event = await forceStartEvent(testUniverseId, 'trade_boom');
      expect(event).not.toBeNull();
      expect(await forceResolveEvent(event!.id)).toBe(true);
      expect(await prices(BOOM_PORT)).toEqual(base);
    });

    it('never touches player ships, credits, cargo, fighters, or shields', async () => {
      const before = await getPlayer(testPlayerId);
      const id = await insertBoom('brewing', [BOOM_PORT, 16], 'fuel', {
        brewingEnds: `NOW() - INTERVAL '1 minute'`,
      });
      await withClient((client) => advanceEvents(client));
      await testPool.query(
        `UPDATE dynamic_events SET active_ends_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
        [id]
      );
      await withClient((client) => advanceEvents(client));
      const after = await getPlayer(testPlayerId);
      for (const key of [
        'credits', 'cargo_fuel', 'cargo_organics', 'cargo_equipment',
        'ship_fighters', 'ship_shields', 'ship_type', 'current_sector', 'turns_remaining',
      ]) {
        expect(after[key]).toEqual(before[key]);
      }
    });

    it('shows up in the sector event list with its commodity', async () => {
      await insertBoom('active', [BOOM_PORT, 16], 'organics');
      const events = await getEventsForSector(testUniverseId, 16);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('trade_boom');
      expect(events[0].params.commodity).toBe('organics');
    });
  });
});
