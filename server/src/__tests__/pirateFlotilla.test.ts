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
  forceStartEvent,
  forceResolveEvent,
  buildFlotillaPlan,
  driftFlotillaPirates,
  FLOTILLA_BOUNTY_BASE,
  FLOTILLA_BOUNTY_PER_FIGHTER,
} from '../services/dynamicEventService';
import {
  presentHailForPlayer,
  payToll,
  fleeEncounter,
  attackPirate,
  resolveRaidOnEntry,
  applyCargoStrip,
  PIRATE_DISHONESTY_CHANCE,
} from '../services/flotillaService';
import {
  moveAlienShips,
  attackAlienShip,
  processAlienAggression,
  getAlienShipsInSector,
} from '../services/alienService';
import { moveToSector, getSectorDetails } from '../controllers/sectorController';
import { adminForceStart } from '../controllers/eventController';

describe('Pirate Flotilla dynamic event', () => {
  let testUserId: number;
  let testUniverseId: number;
  let testPlayerId: number;

  const TOLL_SECTOR = 25;
  const RAIDER_SECTOR = 30;

  const sectorId = async (n: number): Promise<number> =>
    (await testPool.query(
      `SELECT id FROM sectors WHERE universe_id = $1 AND sector_number = $2`,
      [testUniverseId, n]
    )).rows[0].id;

  const link = async (a: number, b: number) => {
    await createWarp(await sectorId(a), b, true);
    await createWarp(await sectorId(b), a, true);
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

  const insertFlotillaEvent = async (
    state: 'brewing' | 'active' | 'resolved',
    region: number[],
    params: Record<string, any> = {}
  ): Promise<number> => {
    const res = await testPool.query(
      `INSERT INTO dynamic_events
         (universe_id, type, state, region_sectors, brewing_ends_at, active_ends_at, params)
       VALUES ($1, 'pirate_flotilla', $2, $3,
          NOW() + INTERVAL '30 minutes', NOW() + INTERVAL '3 hours', $4)
       RETURNING id`,
      [testUniverseId, state, JSON.stringify(region), JSON.stringify({ kills: 0, ...params })]
    );
    return res.rows[0].id;
  };

  const insertPirate = async (
    eventId: number,
    sector: number,
    opts: {
      name?: string;
      isRaider?: boolean;
      fighters?: number;
      shields?: number;
      credits?: number;
      cargoFuel?: number;
      cargoOrganics?: number;
      cargoEquipment?: number;
      bountyValue?: number;
    } = {}
  ): Promise<any> => {
    const fighters = opts.fighters ?? 40;
    const res = await testPool.query(
      `INSERT INTO alien_ships (
         universe_id, sector_number, current_sector, alien_race, ship_name,
         ship_type, behavior, fighters, shields, credits, alignment,
         home_sector, cargo_fuel, cargo_organics, cargo_equipment,
         dynamic_event_id, is_raider, bounty_value
       )
       VALUES ($1, $2, $2, 'Pirate', $3, 'Freighter', 'pirate', $4, $5, $6, -200,
               $2, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        testUniverseId, sector, opts.name ?? 'Test Pirate', fighters,
        opts.shields ?? 150, opts.credits ?? 5000,
        opts.cargoFuel ?? 0, opts.cargoOrganics ?? 0, opts.cargoEquipment ?? 0,
        eventId, opts.isRaider ?? false,
        opts.bountyValue ?? FLOTILLA_BOUNTY_BASE + FLOTILLA_BOUNTY_PER_FIGHTER * fighters,
      ]
    );
    return res.rows[0];
  };

  const piratesOf = async (eventId: number): Promise<any[]> =>
    (await testPool.query(
      `SELECT * FROM alien_ships WHERE dynamic_event_id = $1 ORDER BY id`,
      [eventId]
    )).rows;

  const setPlayer = async (patch: Record<string, any>) => {
    const keys = Object.keys(patch);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    await testPool.query(
      `UPDATE players SET ${sets} WHERE id = $${keys.length + 1}`,
      [...keys.map((k) => patch[k]), testPlayerId]
    );
  };

  const setCargo = async (cargo: {
    fuel?: number; organics?: number; equipment?: number;
    banned?: number; meds?: number; artifacts?: number;
  }) => {
    await setPlayer({
      cargo_fuel: cargo.fuel ?? 0,
      cargo_organics: cargo.organics ?? 0,
      cargo_equipment: cargo.equipment ?? 0,
      cargo_banned_tech: cargo.banned ?? 0,
      cargo_restricted_meds: cargo.meds ?? 0,
      cargo_stolen_artifacts: cargo.artifacts ?? 0,
    });
  };

  const encountersFor = async (playerId: number): Promise<any[]> =>
    (await testPool.query(
      `SELECT * FROM pirate_encounters WHERE player_id = $1 ORDER BY id`,
      [playerId]
    )).rows;

  const broadcasts = async (subjectPart: string): Promise<any[]> =>
    (await testPool.query(
      `SELECT subject, body FROM messages
       WHERE universe_id = $1 AND message_type = 'BROADCAST' AND subject LIKE $2`,
      [testUniverseId, `%${subjectPart}%`]
    )).rows;

  beforeAll(async () => {
    await testPool.query(`DELETE FROM pirate_encounters`);
    await testPool.query(`DELETE FROM dynamic_events`);
    await testPool.query(`DELETE FROM dynamic_event_settings`);
    await testPool.query(`DELETE FROM alien_ships`);
    await cleanupTestDb();

    // The flotilla spawn picks hull names from the same pool alien
    // generation uses; make sure those rows exist in the test DB.
    for (const [name, cost] of [['Scout', 10000], ['Freighter', 30000], ['Trader', 50000], ['Merchant Cruiser', 90000]] as const) {
      await testPool.query(
        `INSERT INTO ship_types (name, universe_id, holds, fighters_max, shields_max, turns_cost, cost_credits)
         SELECT $1::varchar, NULL, 20, 50, 100, 1, $2
         WHERE NOT EXISTS (SELECT 1 FROM ship_types WHERE name = $1::varchar AND universe_id IS NULL)`,
        [name, cost]
      );
    }

    testUserId = await createTestUser('test_flotilla_user');
    testUniverseId = await createTestUniverse('Flotilla Test Universe', 100);

    for (let s = 1; s <= 60; s++) {
      await createTestSector(testUniverseId, s, `Flotilla Sector ${s}`);
    }
    // Main chain outside TerraSpace, TerraSpace chain, and bait links
    // from the main chain into TerraSpace sectors.
    for (let s = 11; s < 50; s++) {
      await link(s, s + 1);
    }
    for (let s = 1; s < 10; s++) {
      await link(s, s + 1);
    }
    await link(15, 5);
    await link(16, 3);
    await link(20, 9);
    for (let s = 51; s < 60; s++) {
      await link(s, s + 1);
    }

    testPlayerId = await createTestPlayerWithStats(
      testUserId, testUniverseId, TOLL_SECTOR, 50000, 100, 500, 100, 'Flotilla Test Corp'
    );
  });

  afterAll(async () => {
    await testPool.query(`DELETE FROM pirate_encounters`);
    await testPool.query(`DELETE FROM dynamic_events`);
    await testPool.query(`DELETE FROM dynamic_event_settings`);
    await testPool.query(`DELETE FROM alien_ships WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM messages WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM bounty_hunters WHERE player_id = $1`, [testPlayerId]);
    await cleanupTestDb();
    await closeTestPool();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await testPool.query(`DELETE FROM pirate_encounters`);
    await testPool.query(`DELETE FROM dynamic_events WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM dynamic_event_settings WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM alien_ships WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM messages WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM bounty_hunters WHERE player_id = $1`, [testPlayerId]);
    await setPlayer({
      current_sector: TOLL_SECTOR,
      turns_remaining: 100,
      credits: 50000,
      ship_fighters: 100,
      ship_shields: 500,
      ship_holds_max: 20,
      in_escape_pod: false,
    });
    await setCargo({});
  });

  describe('Migration 040', () => {
    it('adds the flotilla columns, the encounters table, and the widened checks', async () => {
      const cols = await testPool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'alien_ships'
           AND column_name IN ('dynamic_event_id', 'is_raider', 'bounty_value')`
      );
      expect(cols.rows.length).toBe(3);

      const table = await testPool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'pirate_encounters'`
      );
      expect(table.rows.length).toBe(1);

      const typeCheck = await testPool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
         WHERE conrelid = 'dynamic_events'::regclass AND contype = 'c'`
      );
      expect(typeCheck.rows.map((r: any) => r.def).join(' ')).toContain('pirate_flotilla');

      const behaviorCheck = await testPool.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
         WHERE conrelid = 'alien_ships'::regclass AND contype = 'c'`
      );
      expect(behaviorCheck.rows.map((r: any) => r.def).join(' ')).toContain('pirate');
    });

    it('grants public access to the new table', async () => {
      const grants = await testPool.query(
        `SELECT privilege_type FROM information_schema.table_privileges
         WHERE table_name = 'pirate_encounters' AND grantee = 'PUBLIC'`
      );
      const types = grants.rows.map((r: any) => r.privilege_type);
      expect(types).toContain('SELECT');
      expect(types).toContain('INSERT');
      expect(types).toContain('UPDATE');
      expect(types).toContain('DELETE');
    });
  });

  describe('Flotilla plan', () => {
    it('plans 3 to 6 ships inside the region with in range stats and cargo', () => {
      const region = [21, 22, 23, 24, 25];
      for (let i = 0; i < 200; i++) {
        const plan = buildFlotillaPlan(region);
        expect(plan.length).toBeGreaterThanOrEqual(3);
        expect(plan.length).toBeLessThanOrEqual(6);
        const names = new Set(plan.map((p) => p.shipName));
        expect(names.size).toBe(plan.length);
        for (const ship of plan) {
          expect(region).toContain(ship.sector);
          const cargo = ship.cargoFuel + ship.cargoOrganics + ship.cargoEquipment;
          expect(cargo).toBeGreaterThanOrEqual(10);
          expect(cargo).toBeLessThanOrEqual(30);
          if (ship.isRaider) {
            expect(ship.fighters).toBeGreaterThanOrEqual(80);
            expect(ship.fighters).toBeLessThanOrEqual(120);
            expect(ship.shields).toBeGreaterThanOrEqual(250);
            expect(ship.shields).toBeLessThanOrEqual(400);
            expect(ship.credits).toBeGreaterThanOrEqual(8000);
            expect(ship.credits).toBeLessThanOrEqual(15000);
          } else {
            expect(ship.fighters).toBeGreaterThanOrEqual(30);
            expect(ship.fighters).toBeLessThanOrEqual(50);
            expect(ship.shields).toBeGreaterThanOrEqual(100);
            expect(ship.shields).toBeLessThanOrEqual(200);
            expect(ship.credits).toBeGreaterThanOrEqual(3000);
            expect(ship.credits).toBeLessThanOrEqual(8000);
          }
        }
        // A flotilla of five or six always carries at least one raider.
        if (plan.length >= 5) {
          expect(plan.some((p) => p.isRaider)).toBe(true);
        }
      }
    });

    it('prices the bounty at the 5000 credit floor plus 100 per fighter', () => {
      expect(FLOTILLA_BOUNTY_BASE).toBe(5000);
      expect(FLOTILLA_BOUNTY_PER_FIGHTER).toBe(100);
    });
  });

  describe('Spawn and lifecycle', () => {
    it('creates a brewing flotilla with a fixed plan and no ships yet', async () => {
      const event = await withClient((client) => createEvent(client, testUniverseId, 'pirate_flotilla'));
      expect(event).not.toBeNull();
      expect(event!.state).toBe('brewing');
      expect(event!.regionSectors.length).toBeGreaterThanOrEqual(3);
      expect(event!.regionSectors.length).toBeLessThanOrEqual(5);
      expect(event!.regionSectors.every((n: number) => n > 10)).toBe(true);
      expect(event!.params.shipsSpawned).toBeGreaterThanOrEqual(3);
      expect(event!.params.shipsSpawned).toBeLessThanOrEqual(6);
      expect(event!.params.shipPlan.length).toBe(event!.params.shipsSpawned);
      const raidersInPlan = event!.params.shipPlan.filter((p: any) => p.isRaider).map((p: any) => p.sector);
      expect(event!.params.raiderSectors).toEqual(raidersInPlan);
      expect(await piratesOf(event!.id)).toEqual([]);
    });

    it('spawns the planned pirates when the event goes active', async () => {
      const event = await withClient((client) => createEvent(client, testUniverseId, 'pirate_flotilla'));
      await testPool.query(
        `UPDATE dynamic_events SET brewing_ends_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
        [event!.id]
      );
      await withClient((client) => advanceEvents(client));

      const pirates = await piratesOf(event!.id);
      expect(pirates.length).toBe(event!.params.shipsSpawned);
      for (const pirate of pirates) {
        expect(event!.regionSectors).toContain(pirate.current_sector);
        expect(pirate.current_sector).toBeGreaterThan(10);
        expect(pirate.behavior).toBe('pirate');
        expect(pirate.bounty_value).toBe(5000 + 100 * pirate.fighters);
        expect(pirate.ship_name).toBeTruthy();
      }
      const row = await testPool.query(`SELECT params FROM dynamic_events WHERE id = $1`, [event!.id]);
      expect(row.rows[0].params.shipIds.length).toBe(pirates.length);
      const raiderIds = pirates.filter((p) => p.is_raider).map((p) => p.id);
      expect(row.rows[0].params.raiders).toEqual(raiderIds);
    });

    it('forecast names raider sectors with a red flag, and omits it when there are none', async () => {
      let sawRaiderForecast = false;
      let sawQuietForecast = false;
      for (let i = 0; i < 40 && !(sawRaiderForecast && sawQuietForecast); i++) {
        await testPool.query(`DELETE FROM dynamic_events WHERE universe_id = $1`, [testUniverseId]);
        await testPool.query(`DELETE FROM messages WHERE universe_id = $1`, [testUniverseId]);
        const event = await withClient((client) => createEvent(client, testUniverseId, 'pirate_flotilla'));
        const msgs = await broadcasts('Flotilla Sighted');
        expect(msgs.length).toBe(1);
        expect(msgs[0].body).not.toMatch(/[–—]/);
        const raiderSectors: number[] = event!.params.raiderSectors;
        if (raiderSectors.length > 0) {
          sawRaiderForecast = true;
          expect(msgs[0].body).toContain('RED FLAG');
          for (const s of raiderSectors) {
            expect(msgs[0].body).toContain(String(s));
          }
        } else {
          sawQuietForecast = true;
          expect(msgs[0].body).not.toContain('RED FLAG');
        }
      }
      expect(sawRaiderForecast).toBe(true);
      expect(sawQuietForecast).toBe(true);
    });

    it('works through the admin force start endpoint', async () => {
      const req = { body: { universeId: testUniverseId, type: 'pirate_flotilla' } } as any;
      const res = mockRes();
      await adminForceStart(req, res);
      expect(res.status).not.toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.event.type).toBe('pirate_flotilla');
    });

    it('force start respects the concurrency cap like every other type', async () => {
      const first = await forceStartEvent(testUniverseId, 'pirate_flotilla');
      const second = await forceStartEvent(testUniverseId, 'pirate_flotilla');
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      const third = await forceStartEvent(testUniverseId, 'pirate_flotilla');
      expect(third).toBeNull();
    });

    it('drifts pirates only inside their own region', async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27]);
      const pirate = await insertPirate(eventId, 25, {});
      await withClient((client) => driftFlotillaPirates(client));
      let row = (await testPool.query(`SELECT current_sector FROM alien_ships WHERE id = $1`, [pirate.id])).rows[0];
      // The only in region neighbour of 25 is 26, so the move is forced.
      expect(row.current_sector).toBe(26);
      for (let i = 0; i < 20; i++) {
        await withClient((client) => driftFlotillaPirates(client));
        row = (await testPool.query(`SELECT current_sector FROM alien_ships WHERE id = $1`, [pirate.id])).rows[0];
        expect([25, 26, 27]).toContain(row.current_sector);
      }
    });
  });

  describe('Isolation from the alien systems', () => {
    it('alien movement never moves a pirate', async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27]);
      const pirate = await insertPirate(eventId, 25, {});
      await moveAlienShips(testUniverseId);
      const row = (await testPool.query(`SELECT current_sector FROM alien_ships WHERE id = $1`, [pirate.id])).rows[0];
      expect(row.current_sector).toBe(25);
    });

    it('the generic alien attack refuses a pirate and changes nothing', async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27]);
      const pirate = await insertPirate(eventId, TOLL_SECTOR, { fighters: 40 });
      const before = await getPlayer(testPlayerId);
      await expect(attackAlienShip(testPlayerId, pirate.id)).rejects.toThrow(/flotilla pirate/);
      const pirateAfter = (await testPool.query(`SELECT fighters FROM alien_ships WHERE id = $1`, [pirate.id])).rows[0];
      expect(pirateAfter.fighters).toBe(40);
      const after = await getPlayer(testPlayerId);
      expect(after.turns_remaining).toBe(before.turns_remaining);
      expect(after.ship_fighters).toBe(before.ship_fighters);
    });

    it('alien aggression never engages a pirate', async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27]);
      await insertPirate(eventId, TOLL_SECTOR, { fighters: 100, isRaider: true });
      await processAlienAggression(testUniverseId);
      const player = await getPlayer(testPlayerId);
      expect(player.ship_fighters).toBe(100);
      const logs = await testPool.query(`SELECT COUNT(*) AS c FROM combat_log`);
      expect(parseInt(logs.rows[0].c, 10)).toBe(0);
    });

    it('sector ship listing flags pirates and raiders', async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27, 30]);
      await insertPirate(eventId, TOLL_SECTOR, { name: 'Toll Tester' });
      const ships = await getAlienShipsInSector(testUniverseId, TOLL_SECTOR);
      expect(ships.length).toBe(1);
      expect(ships[0].isPirate).toBe(true);
      expect(ships[0].isRaider).toBe(false);
    });
  });

  describe('Toll encounters', () => {
    const setupHail = async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27]);
      const pirate = await insertPirate(eventId, TOLL_SECTOR, { name: 'Widow Nine' });
      await setCargo({ fuel: 100, organics: 50, equipment: 30, banned: 20, meds: 10, artifacts: 5 });
      const view = await presentHailForPlayer(testPlayerId);
      return { eventId, pirate, view: view! };
    };

    it('presents a hail with a ten percent demand across all six cargo columns', async () => {
      const { view } = await setupHail();
      expect(view.pirateName).toBe('Widow Nine');
      expect(view.isRaider).toBe(false);
      expect(view.demand).toMatchObject({
        fuel: 10, organics: 5, equipment: 3,
        bannedTech: 2, restrictedMeds: 1, stolenArtifacts: 0,
      });
      // Presenting again returns the same open encounter.
      const again = await presentHailForPlayer(testPlayerId);
      expect(again!.id).toBe(view.id);
    });

    it('paying moves legal cargo to the pirate, fences contraband, and never touches credits', async () => {
      const { pirate, view } = await setupHail();
      const result = await payToll(testPlayerId, view.id);
      expect(result.success).toBe(true);

      const player = await getPlayer(testPlayerId);
      expect(player.cargo_fuel).toBe(90);
      expect(player.cargo_organics).toBe(45);
      expect(player.cargo_equipment).toBe(27);
      expect(player.cargo_banned_tech).toBe(18);
      expect(player.cargo_restricted_meds).toBe(9);
      expect(player.cargo_stolen_artifacts).toBe(5);
      expect(Number(player.credits)).toBe(50000);

      const pirateAfter = (await testPool.query(`SELECT * FROM alien_ships WHERE id = $1`, [pirate.id])).rows[0];
      expect(pirateAfter.cargo_fuel).toBe(10);
      expect(pirateAfter.cargo_organics).toBe(5);
      expect(pirateAfter.cargo_equipment).toBe(3);

      const enc = (await encountersFor(testPlayerId))[0];
      expect(enc.state).toBe('paid');
      expect(['permanent', 'cooldown']).toContain(enc.demand.terms);

      // The hail is closed: paying again fails.
      const again = await payToll(testPlayerId, view.id);
      expect(again.success).toBe(false);
    });

    it('paying after a partial cargo loss takes only what is left', async () => {
      const { view } = await setupHail();
      await setPlayer({ cargo_fuel: 4 });
      const result = await payToll(testPlayerId, view.id);
      expect(result.success).toBe(true);
      const player = await getPlayer(testPlayerId);
      expect(player.cargo_fuel).toBe(0);
    });

    it('never hails an escape pod, an empty hold, or a hold too light to toll', async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27]);
      await insertPirate(eventId, TOLL_SECTOR, {});

      await setCargo({});
      expect(await presentHailForPlayer(testPlayerId)).toBeNull();

      await setCargo({ fuel: 5 });
      expect(await presentHailForPlayer(testPlayerId)).toBeNull();

      await setCargo({ fuel: 100 });
      await setPlayer({ in_escape_pod: true });
      expect(await presentHailForPlayer(testPlayerId)).toBeNull();
    });

    it('honors a paid peace by its terms: permanent, cooldown, and the broken word', async () => {
      const { view } = await setupHail();
      await payToll(testPlayerId, view.id);
      const enc = (await encountersFor(testPlayerId))[0];
      const amounts = { fuel: 10, organics: 5, equipment: 3, bannedTech: 2, restrictedMeds: 1, stolenArtifacts: 0 };
      const setTerms = async (terms: Record<string, any>) => {
        await testPool.query(
          `UPDATE pirate_encounters SET demand = $1 WHERE id = $2`,
          [JSON.stringify({ ...amounts, ...terms }), enc.id]
        );
      };
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const past = new Date(Date.now() - 60 * 1000).toISOString();

      // Honest permanent peace: never hailed again this event.
      await setTerms({ terms: 'permanent', honorsWord: true });
      expect(await presentHailForPlayer(testPlayerId)).toBeNull();

      // Honest cooldown still running: no hail yet.
      await setTerms({ terms: 'cooldown', honorsWord: true, cooldownUntil: future });
      expect(await presentHailForPlayer(testPlayerId)).toBeNull();

      // Honest cooldown lapsed: hailed again on the same row.
      await setTerms({ terms: 'cooldown', honorsWord: true, cooldownUntil: past });
      const rehail = await presentHailForPlayer(testPlayerId);
      expect(rehail).not.toBeNull();
      expect(rehail!.id).toBe(enc.id);
      expect(rehail!.state).toBe('hailed');

      // Pay again, then a dishonest pirate with a lapsed break window
      // hails again despite swearing permanent peace.
      await payToll(testPlayerId, enc.id);
      await setTerms({ terms: 'permanent', honorsWord: false, breakAt: past });
      const broken = await presentHailForPlayer(testPlayerId);
      expect(broken).not.toBeNull();
      expect(broken!.state).toBe('hailed');

      // A dishonest pirate whose window has not lapsed stays away.
      await payToll(testPlayerId, enc.id);
      await setTerms({ terms: 'permanent', honorsWord: false, breakAt: future });
      expect(await presentHailForPlayer(testPlayerId)).toBeNull();
    });

    it('rolls honesty once at payment time against the fixed dishonesty chance', async () => {
      expect(PIRATE_DISHONESTY_CHANCE).toBe(0.25);
      const { view } = await setupHail();

      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.1);
      await payToll(testPlayerId, view.id);
      spy.mockRestore();
      let enc = (await encountersFor(testPlayerId))[0];
      expect(enc.demand.terms).toBe('permanent');
      expect(enc.demand.honorsWord).toBe(false);
      expect(enc.demand.breakAt).toBeTruthy();

      // A fresh hail cycle: honest pirate on cooldown terms.
      await testPool.query(`DELETE FROM pirate_encounters`);
      await setCargo({ fuel: 100, organics: 50, equipment: 30, banned: 20, meds: 10, artifacts: 5 });
      const view2 = (await presentHailForPlayer(testPlayerId))!;
      const spy2 = jest.spyOn(Math, 'random').mockReturnValue(0.99);
      await payToll(testPlayerId, view2.id);
      spy2.mockRestore();
      enc = (await encountersFor(testPlayerId))[0];
      expect(enc.demand.terms).toBe('cooldown');
      expect(enc.demand.honorsWord).toBe(true);
      expect(enc.demand.cooldownUntil).toBeTruthy();
      expect(enc.demand.breakAt).toBeUndefined();
    });
  });

  describe('Fleeing', () => {
    const setupHail = async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27]);
      const pirate = await insertPirate(eventId, TOLL_SECTOR, { fighters: 40 });
      await setCargo({ fuel: 100 });
      const view = (await presentHailForPlayer(testPlayerId))!;
      return { eventId, pirate, view };
    };

    it('rejects a destination that is not a warp neighbour', async () => {
      const { view } = await setupHail();
      const result = await fleeEncounter(testPlayerId, view.id, 40);
      expect(result.success).toBe(false);
      const player = await getPlayer(testPlayerId);
      expect(player.current_sector).toBe(TOLL_SECTOR);
      expect(player.turns_remaining).toBe(100);
    });

    it('a clean run costs one turn and moves the player', async () => {
      const { view } = await setupHail();
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.1);
      const result = await fleeEncounter(testPlayerId, view.id, 26);
      spy.mockRestore();
      expect(result.success).toBe(true);
      expect(result.fled).toBe(true);
      const player = await getPlayer(testPlayerId);
      expect(player.current_sector).toBe(26);
      expect(player.turns_remaining).toBe(99);
      const enc = (await encountersFor(testPlayerId))[0];
      expect(enc.state).toBe('fled');
    });

    it('a failed run resolves a fight on the spot with no second turn', async () => {
      const { view } = await setupHail();
      await setPlayer({ ship_fighters: 5, ship_shields: 0 });
      const pirateRow = (await testPool.query(
        `UPDATE alien_ships SET fighters = 1000, shields = 0 WHERE dynamic_event_id IS NOT NULL RETURNING id`
      )).rows[0];
      expect(pirateRow).toBeTruthy();
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.9);
      const result = await fleeEncounter(testPlayerId, view.id, 26);
      spy.mockRestore();
      expect(result.success).toBe(true);
      expect(result.fled).toBe(false);
      expect(result.lost).toBe(true);
      const player = await getPlayer(testPlayerId);
      expect(player.current_sector).toBe(TOLL_SECTOR);
      expect(player.turns_remaining).toBe(99);
      expect(player.cargo_fuel).toBe(0);
      expect(player.ship_fighters).toBe(1);
      const enc = (await encountersFor(testPlayerId))[0];
      expect(enc.state).toBe('lost');
    });

    it('an ion storm on the route can still fail the jump and keep the hail open', async () => {
      const { view } = await setupHail();
      await testPool.query(
        `INSERT INTO dynamic_events
           (universe_id, type, state, region_sectors, brewing_ends_at, active_ends_at, params)
         VALUES ($1, 'ion_storm', 'active', $2, NOW(), NOW() + INTERVAL '3 hours', '{}')`,
        [testUniverseId, JSON.stringify([25, 26])]
      );
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.05);
      const result = await fleeEncounter(testPlayerId, view.id, 26);
      spy.mockRestore();
      expect(result.success).toBe(true);
      expect(result.fled).toBe(false);
      expect(result.stormEffect).toBe('fail');
      const player = await getPlayer(testPlayerId);
      expect(player.current_sector).toBe(TOLL_SECTOR);
      expect(player.turns_remaining).toBe(99);
      const enc = (await encountersFor(testPlayerId))[0];
      expect(enc.state).toBe('hailed');
    });
  });

  describe('Combat and the cargo strip', () => {
    it('applyCargoStrip zeroes exactly the six cargo columns and nothing else', async () => {
      await setCargo({ fuel: 10, organics: 10, equipment: 10, banned: 5, meds: 5, artifacts: 5 });
      const before = await getPlayer(testPlayerId);
      await withClient((client) => applyCargoStrip(client, testPlayerId));
      const after = await getPlayer(testPlayerId);
      for (const col of ['cargo_fuel', 'cargo_organics', 'cargo_equipment', 'cargo_banned_tech', 'cargo_restricted_meds', 'cargo_stolen_artifacts']) {
        expect(after[col]).toBe(0);
      }
      for (const col of ['credits', 'ship_type', 'ship_holds_max', 'ship_fighters', 'ship_shields', 'turns_remaining', 'current_sector', 'in_escape_pod']) {
        expect(after[col]).toEqual(before[col]);
      }
    });

    it('a lost fight strips cargo and floors fighters at 1, ship and credits untouched', async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27]);
      const pirate = await insertPirate(eventId, TOLL_SECTOR, { fighters: 1000, shields: 0 });
      await setPlayer({ ship_fighters: 5, ship_shields: 0 });
      await setCargo({ fuel: 50, organics: 20, banned: 10 });
      const before = await getPlayer(testPlayerId);

      const result = await attackPirate(testPlayerId, { pirateShipId: pirate.id });
      expect(result.success).toBe(true);
      expect(result.lost).toBe(true);

      const after = await getPlayer(testPlayerId);
      expect(after.cargo_fuel).toBe(0);
      expect(after.cargo_organics).toBe(0);
      expect(after.cargo_banned_tech).toBe(0);
      expect(after.ship_fighters).toBe(1);
      expect(after.ship_shields).toBe(0);
      expect(after.ship_type).toBe(before.ship_type);
      expect(after.credits).toBe(before.credits);
      expect(after.in_escape_pod).toBe(before.in_escape_pod);
      expect(after.turns_remaining).toBe(before.turns_remaining - 1);

      // The pirate keeps its damage for the next pilot.
      const pirateAfter = (await testPool.query(`SELECT fighters FROM alien_ships WHERE id = $1`, [pirate.id])).rows[0];
      expect(pirateAfter.fighters).toBeLessThan(1000);
      expect(pirateAfter.fighters).toBeGreaterThan(900);
    });

    it('an even fight fought to the cap holds: no strip, no payout, hail stands', async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27]);
      await insertPirate(eventId, TOLL_SECTOR, { fighters: 10, shields: 100000 });
      await setPlayer({ ship_fighters: 10, ship_shields: 100000 });
      await setCargo({ fuel: 100 });
      const view = (await presentHailForPlayer(testPlayerId))!;

      const result = await attackPirate(testPlayerId, { encounterId: view.id });
      expect(result.success).toBe(true);
      expect(result.victory).toBe(false);
      expect(result.lost).toBe(false);
      const player = await getPlayer(testPlayerId);
      expect(player.cargo_fuel).toBe(100);
      const enc = (await encountersFor(testPlayerId))[0];
      expect(enc.state).toBe('hailed');
    });

    it('escape pods and fighterless ships cannot fight, but can still pay and flee', async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27]);
      const pirate = await insertPirate(eventId, TOLL_SECTOR, {});

      await setPlayer({ in_escape_pod: true });
      const podAttack = await attackPirate(testPlayerId, { pirateShipId: pirate.id });
      expect(podAttack.success).toBe(false);

      await setPlayer({ in_escape_pod: false, ship_fighters: 0 });
      const noFighters = await attackPirate(testPlayerId, { pirateShipId: pirate.id });
      expect(noFighters.success).toBe(false);

      await setCargo({ fuel: 100 });
      const view = (await presentHailForPlayer(testPlayerId))!;
      const spy = jest.spyOn(Math, 'random').mockReturnValue(0.1);
      const fled = await fleeEncounter(testPlayerId, view.id, 26);
      spy.mockRestore();
      expect(fled.success).toBe(true);
      expect(fled.fled).toBe(true);
    });

    it('actions against a resolved flotilla report that it has moved on and change nothing', async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27]);
      await insertPirate(eventId, TOLL_SECTOR, {});
      await setCargo({ fuel: 100 });
      const view = (await presentHailForPlayer(testPlayerId))!;
      await testPool.query(
        `UPDATE dynamic_events SET state = 'resolved', resolved_at = NOW() WHERE id = $1`,
        [eventId]
      );
      const before = await getPlayer(testPlayerId);

      const paid = await payToll(testPlayerId, view.id);
      expect(paid.success).toBe(true);
      expect(paid.movedOn).toBe(true);
      const attacked = await attackPirate(testPlayerId, { encounterId: view.id });
      expect(attacked.movedOn).toBe(true);
      const fled = await fleeEncounter(testPlayerId, view.id, 26);
      expect(fled.movedOn).toBe(true);

      const after = await getPlayer(testPlayerId);
      expect(after.cargo_fuel).toBe(before.cargo_fuel);
      expect(after.turns_remaining).toBe(before.turns_remaining);
      expect(after.ship_fighters).toBe(before.ship_fighters);
    });
  });

  describe('Raids', () => {
    it('a raider jumps a cargo carrier on entry and strips on a win', async () => {
      const eventId = await insertFlotillaEvent('active', [28, 29, 30]);
      await insertPirate(eventId, RAIDER_SECTOR, { isRaider: true, fighters: 1000, shields: 0, name: 'Glass Hammer' });
      await setPlayer({ current_sector: RAIDER_SECTOR, ship_fighters: 5, ship_shields: 0 });
      await setCargo({ fuel: 60, equipment: 10 });

      const result = await resolveRaidOnEntry(testPlayerId, testUniverseId, RAIDER_SECTOR);
      expect(result).not.toBeNull();
      expect(result!.lost).toBe(true);
      const player = await getPlayer(testPlayerId);
      expect(player.cargo_fuel).toBe(0);
      expect(player.cargo_equipment).toBe(0);
      expect(player.ship_fighters).toBe(1);
      expect(player.turns_remaining).toBe(100);

      const encs = await encountersFor(testPlayerId);
      expect(encs.length).toBe(1);
      expect(encs[0].kind).toBe('raid');
      expect(encs[0].state).toBe('lost');
    });

    it('raids skip escape pods and empty holds entirely', async () => {
      const eventId = await insertFlotillaEvent('active', [28, 29, 30]);
      await insertPirate(eventId, RAIDER_SECTOR, { isRaider: true, fighters: 1000 });
      await setPlayer({ current_sector: RAIDER_SECTOR });

      await setCargo({});
      expect(await resolveRaidOnEntry(testPlayerId, testUniverseId, RAIDER_SECTOR)).toBeNull();

      await setCargo({ fuel: 50 });
      await setPlayer({ in_escape_pod: true });
      expect(await resolveRaidOnEntry(testPlayerId, testUniverseId, RAIDER_SECTOR)).toBeNull();
      expect(await encountersFor(testPlayerId)).toEqual([]);
    });

    it('winning a raid pays out like any other kill', async () => {
      const eventId = await insertFlotillaEvent('active', [28, 29, 30]);
      await insertPirate(eventId, RAIDER_SECTOR, {
        isRaider: true, fighters: 5, shields: 0, credits: 9000, name: 'Glass Hammer',
      });
      await setPlayer({ current_sector: RAIDER_SECTOR, ship_fighters: 1000, ship_shields: 0 });
      await setCargo({ fuel: 10 });

      const result = await resolveRaidOnEntry(testPlayerId, testUniverseId, RAIDER_SECTOR);
      expect(result!.victory).toBe(true);
      const player = await getPlayer(testPlayerId);
      expect(Number(player.credits)).toBe(50000 + 9000 + 5500);
      const encs = await encountersFor(testPlayerId);
      expect(encs[0].state).toBe('won');
    });

    it('fires once per warp entry through the movement path, and again on re entry', async () => {
      const eventId = await insertFlotillaEvent('active', [28, 29, 30]);
      await insertPirate(eventId, RAIDER_SECTOR, { isRaider: true, fighters: 1000, shields: 0 });
      await setPlayer({ current_sector: 29, ship_fighters: 5, ship_shields: 0 });
      await setCargo({ fuel: 40 });

      const move = async (dest: number) => {
        const req = { body: { destinationSector: dest }, user: { userId: testUserId } } as any;
        const res = mockRes();
        await moveToSector(req, res);
        return res.json.mock.calls[0][0];
      };

      const first = await move(RAIDER_SECTOR);
      expect(first.success).toBe(true);
      expect(first.raidResult).not.toBeNull();
      expect(first.raidResult.message).toMatch(/RAIDER ATTACK/);
      let player = await getPlayer(testPlayerId);
      expect(player.cargo_fuel).toBe(0);
      expect(player.turns_remaining).toBe(99);
      expect((await encountersFor(testPlayerId)).length).toBe(1);

      // Staying in the sector and viewing it does not re trigger.
      const viewReq = { params: { sectorNumber: String(RAIDER_SECTOR) }, user: { userId: testUserId } } as any;
      const viewRes = mockRes();
      await getSectorDetails(viewReq, viewRes);
      expect((await encountersFor(testPlayerId)).length).toBe(1);

      // Leave with fresh cargo and come back: raided again.
      await setCargo({ fuel: 40 });
      await move(29);
      const second = await move(RAIDER_SECTOR);
      expect(second.raidResult).not.toBeNull();
      expect((await encountersFor(testPlayerId)).length).toBe(2);
      player = await getPlayer(testPlayerId);
      expect(player.cargo_fuel).toBe(0);
    });
  });

  describe('Kill payout', () => {
    it('pays prize plus bounty, loads salvage equipment first, and reports everywhere', async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27]);
      const pirate = await insertPirate(eventId, TOLL_SECTOR, {
        name: 'Widow Nine', fighters: 5, shields: 0, credits: 4000,
        cargoFuel: 3, cargoOrganics: 5, cargoEquipment: 10,
      });
      const bystander = await insertPirate(eventId, 26, { name: 'Second Hull' });
      await setPlayer({ ship_fighters: 1000, ship_shields: 0 });
      await setCargo({});

      const result = await attackPirate(testPlayerId, { pirateShipId: pirate.id });
      expect(result.success).toBe(true);
      expect(result.victory).toBe(true);
      expect(result.prize).toBe(4000);
      expect(result.bonus).toBe(5500);

      const player = await getPlayer(testPlayerId);
      expect(Number(player.credits)).toBe(50000 + 9500);
      expect(player.cargo_equipment).toBe(10);
      expect(player.cargo_organics).toBe(5);
      expect(player.cargo_fuel).toBe(3);
      expect(player.turns_remaining).toBe(99);

      const hunter = await testPool.query(`SELECT * FROM bounty_hunters WHERE player_id = $1`, [testPlayerId]);
      expect(hunter.rows.length).toBe(1);
      expect(hunter.rows[0].bounties_claimed).toBe(1);
      expect(Number(hunter.rows[0].bounty_credits_earned)).toBe(9500);

      expect(await piratesOf(eventId)).toEqual([expect.objectContaining({ id: bystander.id })]);

      const eventRow = await testPool.query(`SELECT params, state FROM dynamic_events WHERE id = $1`, [eventId]);
      expect(eventRow.rows[0].params.kills).toBe(1);
      expect(eventRow.rows[0].state).toBe('active');

      const inbox = await testPool.query(
        `SELECT subject, body FROM messages
         WHERE recipient_id = $1 AND sender_name = 'TerraCorp Bounty Office'`,
        [testPlayerId]
      );
      expect(inbox.rows.length).toBe(1);
      expect(inbox.rows[0].body).toContain('Widow Nine');

      const tnn = await broadcasts('Pirate Down');
      expect(tnn.length).toBe(1);
      expect(tnn[0].body).toContain('Widow Nine');
      expect(tnn[0].body).toContain('Flotilla Test Corp');
      expect(tnn[0].body).not.toMatch(/[–—]/);
    });

    it('salvage that does not fit is lost, equipment still first', async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27]);
      const pirate = await insertPirate(eventId, TOLL_SECTOR, {
        fighters: 5, shields: 0, credits: 1000,
        cargoFuel: 10, cargoOrganics: 10, cargoEquipment: 10,
      });
      await setPlayer({ ship_fighters: 1000, ship_shields: 0 });
      await setCargo({ fuel: 15 });

      const result = await attackPirate(testPlayerId, { pirateShipId: pirate.id });
      expect(result.victory).toBe(true);
      const player = await getPlayer(testPlayerId);
      expect(player.cargo_equipment).toBe(5);
      expect(player.cargo_organics).toBe(0);
      expect(player.cargo_fuel).toBe(15);
    });

    it('killing the last pirate resolves the event on the spot', async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27]);
      const pirate = await insertPirate(eventId, TOLL_SECTOR, { fighters: 5, shields: 0, name: 'Last Hull' });
      await setPlayer({ ship_fighters: 1000, ship_shields: 0 });
      await setCargo({ fuel: 10 });

      const result = await attackPirate(testPlayerId, { pirateShipId: pirate.id });
      expect(result.victory).toBe(true);

      const eventRow = await testPool.query(`SELECT state FROM dynamic_events WHERE id = $1`, [eventId]);
      expect(eventRow.rows[0].state).toBe('resolved');
      expect((await broadcasts('Pirate Down')).length).toBe(1);
      const broken = await broadcasts('Flotilla Broken');
      expect(broken.length).toBe(1);
      expect(broken[0].body).not.toMatch(/[–—]/);
    });
  });

  describe('Resolution cleanup', () => {
    it('force resolving a flotilla deletes its pirates and expires open hails', async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27]);
      await insertPirate(eventId, TOLL_SECTOR, {});
      await insertPirate(eventId, 26, { isRaider: true });
      await setCargo({ fuel: 100 });
      const view = (await presentHailForPlayer(testPlayerId))!;
      expect(view).toBeTruthy();

      expect(await forceResolveEvent(eventId)).toBe(true);
      expect(await piratesOf(eventId)).toEqual([]);
      const encs = await encountersFor(testPlayerId);
      expect(encs.length).toBe(1);
      expect(encs[0].state).toBe('expired');
      expect(encs[0].pirate_ship_id).toBeNull();

      const tnn = await broadcasts('Flotilla Moves On');
      expect(tnn.length).toBe(1);
      expect(tnn[0].body).not.toMatch(/[–—]/);
    });
  });

  describe('Sector payload', () => {
    it('carries the hail, the pirate flags, and the live raider sectors', async () => {
      const eventId = await insertFlotillaEvent('active', [25, 26, 27, 30]);
      await insertPirate(eventId, TOLL_SECTOR, { name: 'Widow Nine' });
      await insertPirate(eventId, RAIDER_SECTOR, { isRaider: true, name: 'Glass Hammer' });
      await setCargo({ fuel: 100, organics: 50 });

      const req = { params: { sectorNumber: String(TOLL_SECTOR) }, user: { userId: testUserId } } as any;
      const res = mockRes();
      await getSectorDetails(req, res);
      const payload = res.json.mock.calls[0][0];
      const sector = payload.sector;

      expect(sector.flotillaEncounter).not.toBeNull();
      expect(sector.flotillaEncounter.pirateName).toBe('Widow Nine');
      expect(sector.flotillaEncounter.demand.fuel).toBe(10);
      expect(sector.raiderSectors).toContain(RAIDER_SECTOR);

      const pirateEntry = sector.alienShips.find((a: any) => a.shipName === 'Widow Nine');
      expect(pirateEntry.isPirate).toBe(true);
      expect(pirateEntry.isRaider).toBe(false);

      const flotilla = sector.dynamicEvents.find((e: any) => e.type === 'pirate_flotilla');
      expect(flotilla).toBeTruthy();
      expect(flotilla.shipsRemaining).toBe(2);
      expect(flotilla.raiderSectors).toContain(RAIDER_SECTOR);
    });
  });
});
