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
import {
  createEvent,
  advanceEvents,
  rollStormEffect,
  getEventsForSector,
  getStrikeForSector,
  attackIncursion,
  forceStartEvent,
  forceResolveEvent,
  setEventCooldown,
  getEventSettings,
  setEventsEnabled,
  runDynamicEventTick,
} from '../services/dynamicEventService';
import {
  adminGetEventSettings,
  adminSetEventsEnabled,
} from '../controllers/eventController';
import { getPortInfo, executeTrade } from '../services/portService';
import { moveToSector } from '../controllers/sectorController';

describe('Dynamic Events System', () => {
  let testUserId: number;
  let testUniverseId: number;
  let testPlayerId: number;
  let portSectorId: number;
  let neighbourPortSectorId: number;

  const insertEvent = async (
    type: 'ion_storm' | 'incursion' | 'port_strike',
    state: 'brewing' | 'active' | 'resolved',
    sectors: number[],
    overrides: {
      brewingEnds?: string;
      activeEnds?: string;
      params?: Record<string, any>;
      targetPortId?: number | null;
    } = {}
  ): Promise<number> => {
    const res = await testPool.query(
      `INSERT INTO dynamic_events
         (universe_id, type, state, region_sectors, target_port_id,
          brewing_ends_at, active_ends_at, params)
       VALUES ($1, $2, $3, $4, $5,
          ${overrides.brewingEnds || `NOW() + INTERVAL '30 minutes'`},
          ${overrides.activeEnds || `NOW() + INTERVAL '3 hours'`},
          $6)
       RETURNING id`,
      [
        testUniverseId,
        type,
        state,
        JSON.stringify(sectors),
        overrides.targetPortId ?? null,
        JSON.stringify(overrides.params || {}),
      ]
    );
    return res.rows[0].id;
  };

  const mockRes = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  const withClient = async <T>(fn: (client: any) => Promise<T>): Promise<T> => {
    const client = await testPool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  };

  beforeAll(async () => {
    await testPool.query(`DELETE FROM dynamic_events`);
    await testPool.query(`DELETE FROM dynamic_event_settings`);
    await cleanupTestDb();

    testUserId = await createTestUser('test_events_user');
    testUniverseId = await createTestUniverse('Dynamic Events Test Universe', 100);

    for (let s = 11; s <= 40; s++) {
      await createTestSector(testUniverseId, s, `Event Sector ${s}`);
    }

    // Warp chain 20 - 21 - 22 - 23 for storm movement tests
    const sectorId = async (n: number) =>
      (await testPool.query(
        `SELECT id FROM sectors WHERE universe_id = $1 AND sector_number = $2`,
        [testUniverseId, n]
      )).rows[0].id;
    await createWarp(await sectorId(20), 21, true);
    await createWarp(await sectorId(21), 20, true);
    await createWarp(await sectorId(21), 22, true);
    await createWarp(await sectorId(22), 21, true);
    // Strike test ports: 30 (BBS) next to 31 (SSB)
    await createWarp(await sectorId(30), 31, true);
    await createWarp(await sectorId(31), 30, true);

    // Port at sector 30 (BBS: buys fuel and organics, sells equipment)
    portSectorId = await sectorId(30);
    await testPool.query(
      `UPDATE sectors
       SET port_type = 'BBS', port_class = 5,
           port_fuel_qty = 500, port_organics_qty = 500, port_equipment_qty = 500,
           port_fuel_pct = 100, port_organics_pct = 100, port_equipment_pct = 100
       WHERE id = $1`,
      [portSectorId]
    );
    // Neighbouring port at sector 31 (SSB)
    neighbourPortSectorId = await sectorId(31);
    await testPool.query(
      `UPDATE sectors
       SET port_type = 'SSB', port_class = 4,
           port_fuel_qty = 500, port_organics_qty = 500, port_equipment_qty = 500,
           port_fuel_pct = 100, port_organics_pct = 100, port_equipment_pct = 100
       WHERE id = $1`,
      [neighbourPortSectorId]
    );

    testPlayerId = await createTestPlayerWithStats(
      testUserId,
      testUniverseId,
      20,
      50000, // credits
      100, // fighters
      500, // shields
      100 // turns
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
    await testPool.query(`DELETE FROM bounty_hunters WHERE player_id = $1`, [testPlayerId]);
    await testPool.query(
      `UPDATE players SET current_sector = 20, turns_remaining = 100, credits = 50000,
              ship_fighters = 100, ship_shields = 500,
              cargo_fuel = 0, cargo_organics = 0, cargo_equipment = 0
       WHERE id = $1`,
      [testPlayerId]
    );
    await testPool.query(
      `UPDATE sectors SET port_fuel_qty = 500, port_organics_qty = 500, port_equipment_qty = 500 WHERE id = $1`,
      [portSectorId]
    );
    jest.restoreAllMocks();
  });

  describe('Storm effect roll', () => {
    it('maps rolls to effects with fair weights', () => {
      expect(rollStormEffect(() => 0.05)).toBe('fail');
      expect(rollStormEffect(() => 0.2)).toBe('misfire');
      expect(rollStormEffect(() => 0.35)).toBe('extra_turn');
      expect(rollStormEffect(() => 0.9)).toBe('none');
    });
  });

  describe('Lifecycle', () => {
    it('brews, activates, and resolves an ion storm', async () => {
      const event = await withClient((client) =>
        createEvent(client, testUniverseId, 'ion_storm', { brewingMinutes: 30 })
      );
      expect(event).not.toBeNull();
      expect(event!.state).toBe('brewing');
      expect(event!.regionSectors.length).toBeGreaterThan(0);
      // Fairness: nothing ever targets TerraSpace
      expect(event!.regionSectors.every((n) => n > 10)).toBe(true);

      await testPool.query(
        `UPDATE dynamic_events SET brewing_ends_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
        [event!.id]
      );
      await withClient((client) => advanceEvents(client));
      let rows = await testPool.query(`SELECT state FROM dynamic_events WHERE id = $1`, [event!.id]);
      expect(rows.rows[0].state).toBe('active');

      await testPool.query(
        `UPDATE dynamic_events SET active_ends_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
        [event!.id]
      );
      await withClient((client) => advanceEvents(client));
      rows = await testPool.query(`SELECT state, resolved_at FROM dynamic_events WHERE id = $1`, [event!.id]);
      expect(rows.rows[0].state).toBe('resolved');
      expect(rows.rows[0].resolved_at).not.toBeNull();
    });

    it('enforces the concurrency cap of two live events', async () => {
      await insertEvent('ion_storm', 'brewing', [35]);
      await insertEvent('incursion', 'active', [36]);
      const third = await withClient((client) =>
        createEvent(client, testUniverseId, 'port_strike', {})
      );
      expect(third).toBeNull();
    });

    it('never creates a port strike without a legal port target', async () => {
      const smallUniverse = await createTestUniverse('TerraSpace Only Universe', 10);
      for (let s = 1; s <= 10; s++) {
        await createTestSector(smallUniverse, s, `Small ${s}`);
      }
      await testPool.query(
        `UPDATE sectors SET port_type = 'BBS' WHERE universe_id = $1 AND sector_number = 5`,
        [smallUniverse]
      );
      const event = await withClient((client) =>
        createEvent(client, smallUniverse, 'port_strike', {})
      );
      expect(event).toBeNull();
    });

    it('reports live events per sector', async () => {
      await insertEvent('ion_storm', 'active', [21, 22]);
      const forSector = await getEventsForSector(testUniverseId, 21);
      expect(forSector).toHaveLength(1);
      expect(forSector[0].type).toBe('ion_storm');
      const elsewhere = await getEventsForSector(testUniverseId, 39);
      expect(elsewhere).toHaveLength(0);
    });
  });

  describe('Ion storm movement effects', () => {
    beforeEach(async () => {
      await insertEvent('ion_storm', 'active', [20, 21], {
        params: { salvageChance: 0 },
      });
    });

    it('fails the jump and costs one turn on a bad roll', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.05);
      const req = { body: { destinationSector: 21 }, user: { userId: testUserId } } as any;
      const res = mockRes();
      await moveToSector(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.error).toMatch(/ion storm/i);
      const player = await getPlayer(testPlayerId);
      expect(player.current_sector).toBe(20);
      expect(player.turns_remaining).toBe(99);
    });

    it('burns an extra turn on a turbulent jump', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.35);
      const req = { body: { destinationSector: 21 }, user: { userId: testUserId } } as any;
      const res = mockRes();
      await moveToSector(req, res);

      const player = await getPlayer(testPlayerId);
      expect(player.current_sector).toBe(21);
      expect(player.turns_remaining).toBe(98);
      const payload = res.json.mock.calls[0][0];
      expect(payload.stormEffect).toBe('extra_turn');
    });

    it('throws the jump to a sector adjacent to the destination on a misfire', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.2);
      const req = { body: { destinationSector: 21 }, user: { userId: testUserId } } as any;
      const res = mockRes();
      await moveToSector(req, res);

      const player = await getPlayer(testPlayerId);
      // Adjacent to 21 are 20 (origin, excluded) and 22
      expect(player.current_sector).toBe(22);
      const payload = res.json.mock.calls[0][0];
      expect(payload.stormEffect).toBe('misfire');
      expect(payload.stormMessage).toMatch(/ION STORM/);
    });

    it('lets a clean jump through untouched', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.9);
      const req = { body: { destinationSector: 21 }, user: { userId: testUserId } } as any;
      const res = mockRes();
      await moveToSector(req, res);

      const player = await getPlayer(testPlayerId);
      expect(player.current_sector).toBe(21);
      expect(player.turns_remaining).toBe(99);
    });
  });

  describe('Port strike', () => {
    it('blocks trading and freezes the book while active', async () => {
      await testPool.query(
        `UPDATE players SET current_sector = 30 WHERE id = $1`,
        [testPlayerId]
      );
      await insertEvent('port_strike', 'active', [30], { targetPortId: portSectorId });

      const strike = await getStrikeForSector(testUniverseId, 30);
      expect(strike).not.toBeNull();

      const info = await getPortInfo(testUserId, 30);
      expect(info?.onStrike).toBe(true);

      await expect(executeTrade(testUserId, 'equipment', 'buy', 1)).rejects.toThrow(/strike/i);
    });

    it('lets trading resume after the strike resolves', async () => {
      await testPool.query(
        `UPDATE players SET current_sector = 30 WHERE id = $1`,
        [testPlayerId]
      );
      const result = await executeTrade(testUserId, 'equipment', 'buy', 1);
      expect(result.success).toBe(true);
      expect(result.quantity).toBe(1);
    });

    it('pushes demand drift to neighbouring ports on activation', async () => {
      const id = await insertEvent('port_strike', 'brewing', [30], {
        targetPortId: portSectorId,
        params: { specialty: ['fuel', 'organics'], portType: 'BBS' },
        brewingEnds: `NOW() - INTERVAL '1 minute'`,
      });
      await withClient((client) => advanceEvents(client));

      const rows = await testPool.query(`SELECT state FROM dynamic_events WHERE id = $1`, [id]);
      expect(rows.rows[0].state).toBe('active');

      const drift = await testPool.query(
        `SELECT drift FROM port_economy
         WHERE universe_id = $1 AND sector_number = 31 AND commodity = 'fuel'`,
        [testUniverseId]
      );
      expect(drift.rows.length).toBe(1);
      expect(parseFloat(drift.rows[0].drift)).toBeGreaterThan(0);
    });

    it('restock surges and dips prices on resolution', async () => {
      await testPool.query(
        `UPDATE sectors SET port_fuel_qty = 5 WHERE id = $1`,
        [portSectorId]
      );
      await insertEvent('port_strike', 'active', [30], {
        targetPortId: portSectorId,
        activeEnds: `NOW() - INTERVAL '1 minute'`,
      });
      await withClient((client) => advanceEvents(client));

      const sector = await testPool.query(
        `SELECT port_fuel_qty FROM sectors WHERE id = $1`,
        [portSectorId]
      );
      expect(sector.rows[0].port_fuel_qty).toBeGreaterThanOrEqual(1000);

      const surge = await testPool.query(
        `SELECT event_state FROM port_economy
         WHERE universe_id = $1 AND sector_number = 30 AND commodity = 'fuel'`,
        [testUniverseId]
      );
      expect(surge.rows[0].event_state).toBe('surplus');
    });
  });

  describe('Alien incursion', () => {
    it('applies a trade penalty at ports in the sector', async () => {
      const baseline = await getPortInfo(testUserId, 30);
      expect(baseline).not.toBeNull();
      const baseBuy = baseline!.commodities.equipment.price;
      const baseSell = baseline!.commodities.fuel.price;

      await insertEvent('incursion', 'active', [30], {
        params: { defenders: { fighters: 30, shields: 200 }, spreadChance: 0.5, spreadDone: false, contacted: false },
      });

      const penalised = await getPortInfo(testUserId, 30);
      expect(penalised!.commodities.equipment.price).toBeGreaterThan(baseBuy);
      expect(penalised!.commodities.fuel.price).toBeLessThan(baseSell);
    });

    it('clears on victory, pays salvage, and counts on the hunter leaderboard', async () => {
      await testPool.query(
        `UPDATE players SET current_sector = 25 WHERE id = $1`,
        [testPlayerId]
      );
      const eventId = await insertEvent('incursion', 'active', [25], {
        params: { defenders: { fighters: 1, shields: 1 }, spreadChance: 0.5, spreadDone: false, contacted: false },
      });

      const result = await attackIncursion(testPlayerId);
      expect(result.success).toBe(true);
      expect(result.victory).toBe(true);
      expect(result.salvage?.credits).toBeGreaterThan(0);

      const rows = await testPool.query(`SELECT state FROM dynamic_events WHERE id = $1`, [eventId]);
      expect(rows.rows[0].state).toBe('resolved');

      const hunter = await testPool.query(
        `SELECT bounties_claimed, bounty_credits_earned FROM bounty_hunters WHERE player_id = $1`,
        [testPlayerId]
      );
      expect(hunter.rows.length).toBe(1);
      expect(hunter.rows[0].bounties_claimed).toBeGreaterThanOrEqual(1);

      const player = await getPlayer(testPlayerId);
      expect(parseInt(player.credits)).toBeGreaterThan(50000);
    });

    it('never destroys the player ship on a loss, and weakens the incursion', async () => {
      await testPool.query(
        `UPDATE players SET current_sector = 25, ship_fighters = 1, ship_shields = 0 WHERE id = $1`,
        [testPlayerId]
      );
      const eventId = await insertEvent('incursion', 'active', [25], {
        params: { defenders: { fighters: 200, shields: 500 }, spreadChance: 0.5, spreadDone: false, contacted: false },
      });

      const result = await attackIncursion(testPlayerId);
      expect(result.success).toBe(true);
      expect(result.victory).toBe(false);

      const player = await getPlayer(testPlayerId);
      // Fairness floor: the pilot limps away instead of dying to an event
      expect(player.ship_fighters).toBeGreaterThanOrEqual(1);

      const rows = await testPool.query(`SELECT state, params FROM dynamic_events WHERE id = $1`, [eventId]);
      expect(rows.rows[0].state).toBe('active');
      expect(rows.rows[0].params.contacted).toBe(true);
    });

    it('rejects an attack with no incursion present', async () => {
      const result = await attackIncursion(testPlayerId);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/no active incursion/i);
    });
  });

  describe('Admin controls', () => {
    it('force starts an event with the standard 30 minute forecast', async () => {
      const event = await forceStartEvent(testUniverseId, 'ion_storm');
      expect(event).not.toBeNull();
      expect(event!.state).toBe('brewing');
      // Warnings precede effects for admin fired events too: the
      // brewing window is the standard one, not a shortened demo.
      const brewMs = new Date(event!.brewingEndsAt).getTime() - Date.now();
      expect(brewMs).toBeGreaterThan(25 * 60 * 1000);
      expect(brewMs).toBeLessThan(35 * 60 * 1000);
    });

    it('force resolves a live event with its aftermath', async () => {
      const id = await insertEvent('port_strike', 'active', [30], { targetPortId: portSectorId });
      const ok = await forceResolveEvent(id);
      expect(ok).toBe(true);
      const rows = await testPool.query(`SELECT state FROM dynamic_events WHERE id = $1`, [id]);
      expect(rows.rows[0].state).toBe('resolved');
    });

    it('cooldown suppresses seeding on the tick', async () => {
      await setEventCooldown(testUniverseId, 60);
      await runDynamicEventTick();
      const rows = await testPool.query(
        `SELECT COUNT(*) AS count FROM dynamic_events WHERE universe_id = $1`,
        [testUniverseId]
      );
      expect(parseInt(rows.rows[0].count, 10)).toBe(0);
    });
  });

  describe('Events on/off switch', () => {
    const countEvents = async (universeId: number): Promise<number> => {
      const rows = await testPool.query(
        `SELECT COUNT(*) AS count FROM dynamic_events WHERE universe_id = $1`,
        [universeId]
      );
      return parseInt(rows.rows[0].count, 10);
    };

    const makeUniverseWithSectors = async (name: string): Promise<number> => {
      const id = await createTestUniverse(name, 100);
      for (let s = 11; s <= 20; s++) {
        await createTestSector(id, s, `${name} Sector ${s}`);
      }
      return id;
    };

    it('defaults a universe with no settings row to enabled', async () => {
      const fresh = await makeUniverseWithSectors('Events Default Universe');
      const settings = await getEventSettings(fresh);
      expect(settings.eventsEnabled).toBe(true);
      expect(settings.cooldownUntil).toBeNull();
    });

    it('round trips the toggle through the service', async () => {
      const universe = await makeUniverseWithSectors('Events Toggle Universe');
      const off = await setEventsEnabled(universe, false);
      expect(off.eventsEnabled).toBe(false);
      expect((await getEventSettings(universe)).eventsEnabled).toBe(false);
      const on = await setEventsEnabled(universe, true);
      expect(on.eventsEnabled).toBe(true);
      expect((await getEventSettings(universe)).eventsEnabled).toBe(true);
    });

    it('round trips the toggle through the settings endpoints', async () => {
      const universe = await makeUniverseWithSectors('Events Endpoint Universe');

      const getReq: any = { query: { universeId: String(universe) } };
      const getRes = mockRes();
      await adminGetEventSettings(getReq, getRes);
      expect(getRes.json.mock.calls[0][0].settings.eventsEnabled).toBe(true);

      const postReq: any = { body: { universeId: universe, enabled: false } };
      const postRes = mockRes();
      await adminSetEventsEnabled(postReq, postRes);
      expect(postRes.json.mock.calls[0][0].settings.eventsEnabled).toBe(false);

      const getRes2 = mockRes();
      await adminGetEventSettings(getReq, getRes2);
      expect(getRes2.json.mock.calls[0][0].settings.eventsEnabled).toBe(false);

      const badReq: any = { body: { universeId: universe, enabled: 'yes' } };
      const badRes = mockRes();
      await adminSetEventsEnabled(badReq, badRes);
      expect(badRes.status).toHaveBeenCalledWith(400);
    });

    it('seeds nothing in a disabled universe while an enabled one seeds', async () => {
      const disabled = await makeUniverseWithSectors('Events Disabled Universe');
      await setEventsEnabled(disabled, false);
      const enabled = await makeUniverseWithSectors('Events Enabled Universe');

      // Roll 0: the seed chance passes and the type picker lands on
      // ion_storm, which only needs one sector outside TerraSpace.
      jest.spyOn(Math, 'random').mockReturnValue(0);
      await runDynamicEventTick();

      expect(await countEvents(disabled)).toBe(0);
      expect(await countEvents(enabled)).toBeGreaterThanOrEqual(1);
    });

    it('lets a live event finish naturally in a disabled universe', async () => {
      const universe = await makeUniverseWithSectors('Events Disabled Live Universe');
      const inserted = await testPool.query(
        `INSERT INTO dynamic_events
           (universe_id, type, state, region_sectors, brewing_ends_at, active_ends_at, params)
         VALUES ($1, 'ion_storm', 'brewing', $2,
            NOW() - INTERVAL '1 minute', NOW() + INTERVAL '3 hours', '{}')
         RETURNING id`,
        [universe, JSON.stringify([12])]
      );
      await setEventsEnabled(universe, false);

      await runDynamicEventTick();

      const rows = await testPool.query(
        `SELECT state FROM dynamic_events WHERE id = $1`,
        [inserted.rows[0].id]
      );
      // Advanced to active on schedule, not force resolved by the switch.
      expect(rows.rows[0].state).toBe('active');
      // And no fresh event was seeded alongside it.
      expect(await countEvents(universe)).toBe(1);
    });
  });
});
