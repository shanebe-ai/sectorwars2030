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
  createEvent,
  forceStartEvent,
  forceResolveEvent,
  settleContract,
  getContractProgress,
  CONTRACT_GOAL_UNITS,
} from '../services/dynamicEventService';
import { executeTrade } from '../services/portService';
import { adminForceStart } from '../controllers/eventController';

describe('TerraCorp Contract dynamic event', () => {
  let testUserA: number;
  let testUserB: number;
  let testUniverseId: number;
  let playerA: number;
  let playerB: number;

  // Sector 15 is a BBS port (buys fuel and organics). Sector 40 is a
  // second BBS port far away, for wrong port sales. Sector 17 is SSB
  // (buys equipment) so creation has more than one port shape to pick.
  const CONTRACT_PORT = 15;
  const OTHER_PORT = 40;

  const sectorId = async (n: number): Promise<number> =>
    (await testPool.query(
      `SELECT id FROM sectors WHERE universe_id = $1 AND sector_number = $2`,
      [testUniverseId, n]
    )).rows[0].id;

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

  const insertContract = async (
    state: 'brewing' | 'active',
    sector: number,
    params: { commodity: string; goal: number; pool: number }
  ): Promise<number> => {
    const res = await testPool.query(
      `INSERT INTO dynamic_events
         (universe_id, type, state, region_sectors, target_port_id, brewing_ends_at, active_ends_at, params)
       VALUES ($1, 'contract', $2, $3, $4,
          NOW() + INTERVAL '30 minutes', NOW() + INTERVAL '3 hours', $5)
       RETURNING id`,
      [testUniverseId, state, JSON.stringify([sector]), await sectorId(sector), JSON.stringify(params)]
    );
    return res.rows[0].id;
  };

  const addContribution = async (eventId: number, playerId: number, amount: number) => {
    await testPool.query(
      `INSERT INTO dynamic_event_contributions (event_id, player_id, amount)
       VALUES ($1, $2, $3)`,
      [eventId, playerId, amount]
    );
  };

  const contributions = async (eventId: number) =>
    (await testPool.query(
      `SELECT player_id, amount, paid_credits FROM dynamic_event_contributions
       WHERE event_id = $1 ORDER BY player_id`,
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
    await testPool.query(`DELETE FROM dynamic_event_contributions`);
    await testPool.query(`DELETE FROM dynamic_events`);
    await testPool.query(`DELETE FROM dynamic_event_settings`);
    await cleanupTestDb();

    testUserA = await createTestUser('test_contract_user_a');
    testUserB = await createTestUser('test_contract_user_b');
    testUniverseId = await createTestUniverse('Contract Test Universe', 100);

    for (let s = 1; s <= 40; s++) {
      await createTestSector(testUniverseId, s, `Contract Sector ${s}`);
    }
    await setPort(CONTRACT_PORT, 'BBS');
    await setPort(17, 'SSB');
    await setPort(OTHER_PORT, 'BBS');

    playerA = await createTestPlayerWithStats(testUserA, testUniverseId, CONTRACT_PORT, 50000, 100, 500, 500);
    playerB = await createTestPlayerWithStats(testUserB, testUniverseId, CONTRACT_PORT, 50000, 100, 500, 500);
  });

  afterAll(async () => {
    await testPool.query(`DELETE FROM dynamic_event_contributions`);
    await testPool.query(`DELETE FROM dynamic_events`);
    await testPool.query(`DELETE FROM dynamic_event_settings`);
    await cleanupTestDb();
    await closeTestPool();
  });

  beforeEach(async () => {
    await testPool.query(`DELETE FROM dynamic_event_contributions`);
    await testPool.query(`DELETE FROM dynamic_events WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM dynamic_event_settings WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM messages WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(
      `UPDATE players SET current_sector = $1, turns_remaining = 500, credits = 50000,
              ship_fighters = 100, ship_shields = 500,
              cargo_fuel = 100, cargo_organics = 100, cargo_equipment = 0
       WHERE id = ANY($2)`,
      [CONTRACT_PORT, [playerA, playerB]]
    );
  });

  describe('Creation', () => {
    it('picks a buying port outside TerraSpace with goal and pool from the game numbers', async () => {
      const basePrices: Record<string, number> = { fuel: 20, organics: 35, equipment: 55 };
      for (let i = 0; i < 8; i++) {
        await testPool.query(`DELETE FROM dynamic_events WHERE universe_id = $1`, [testUniverseId]);
        const event = await withClient((client) => createEvent(client, testUniverseId, 'contract'));
        expect(event).not.toBeNull();
        expect(event!.state).toBe('brewing');
        expect(event!.regionSectors.length).toBe(1);
        const sector = event!.regionSectors[0];
        expect(sector).toBeGreaterThan(10);
        expect([CONTRACT_PORT, 17, OTHER_PORT]).toContain(sector);
        expect(event!.targetPortId).toBe(await sectorId(sector));

        const portType = sector === 17 ? 'SSB' : 'BBS';
        const letters = portType.split('');
        const bought = ['fuel', 'organics', 'equipment'].filter((_, idx) => letters[idx] === 'B');
        expect(bought).toContain(event!.params.commodity);
        expect(event!.params.goal).toBe(CONTRACT_GOAL_UNITS);
        const expectedPool =
          50000 + Math.floor(CONTRACT_GOAL_UNITS * basePrices[event!.params.commodity] * 0.05);
        expect(event!.params.pool).toBe(expectedPool);
      }
    });

    it('announces the forecast on TNN naming port, commodity, goal, and pool', async () => {
      const event = await withClient((client) =>
        createEvent(client, testUniverseId, 'contract', { brewingMinutes: 30 })
      );
      const msgs = await testPool.query(
        `SELECT subject, body FROM messages WHERE universe_id = $1 AND message_type = 'BROADCAST'`,
        [testUniverseId]
      );
      expect(msgs.rows.length).toBe(1);
      expect(msgs.rows[0].subject).toMatch(/TerraCorp/);
      expect(msgs.rows[0].body).toContain(`Sector ${event!.regionSectors[0]}`);
      expect(msgs.rows[0].body).toContain(String(event!.params.goal));
      expect(msgs.rows[0].body).toContain(String(event!.params.pool));
      expect(msgs.rows[0].body).not.toMatch(/[\u2013\u2014]/);
    });

    it('works through the admin force start endpoint', async () => {
      const req = { body: { universeId: testUniverseId, type: 'contract' } } as any;
      const res = mockRes();
      await adminForceStart(req, res);
      expect(res.status).not.toHaveBeenCalled();
      const payload = res.json.mock.calls[0][0];
      expect(payload.event.type).toBe('contract');
    });
  });

  describe('Delivery counting', () => {
    it('counts sales of the contract commodity at the contract port while active', async () => {
      const id = await insertContract('active', CONTRACT_PORT, { commodity: 'fuel', goal: 500, pool: 50500 });
      const before = await getPlayer(playerA);

      const result = await executeTrade(testUserA, 'fuel', 'sell', 10);
      expect(result.success).toBe(true);
      const second = await executeTrade(testUserA, 'fuel', 'sell', 5);

      const rows = await contributions(id);
      expect(rows.length).toBe(1);
      expect(rows[0].player_id).toBe(playerA);
      expect(rows[0].amount).toBe(15);
      expect(rows[0].paid_credits).toBeNull();

      // The sale itself paid the normal price; counting is separate.
      const after = await getPlayer(playerA);
      expect(Number(after.credits)).toBe(Number(before.credits) + result.totalCost + second.totalCost);

      const progress = await getContractProgress(id, playerA);
      expect(progress.totalDelivered).toBe(15);
      expect(progress.playerDelivered).toBe(15);
    });

    it('ignores other commodities, other ports, and the brewing window', async () => {
      const id = await insertContract('active', CONTRACT_PORT, { commodity: 'fuel', goal: 500, pool: 50500 });

      // Wrong commodity: the port buys organics too, but the contract wants fuel.
      await executeTrade(testUserA, 'organics', 'sell', 10);
      expect(await contributions(id)).toEqual([]);

      // Wrong port: same commodity, different port.
      await testPool.query(`UPDATE players SET current_sector = $1 WHERE id = $2`, [OTHER_PORT, playerA]);
      await executeTrade(testUserA, 'fuel', 'sell', 10);
      expect(await contributions(id)).toEqual([]);
      await testPool.query(`UPDATE players SET current_sector = $1 WHERE id = $2`, [CONTRACT_PORT, playerA]);

      // Brewing: deliveries before the contract opens do not count.
      const brewingId = await insertContract('brewing', CONTRACT_PORT, { commodity: 'fuel', goal: 500, pool: 50500 });
      await executeTrade(testUserA, 'fuel', 'sell', 10);
      expect(await contributions(brewingId)).toEqual([]);
      expect(await contributions(id)).toEqual([
        expect.objectContaining({ player_id: playerA, amount: 10 }),
      ]);
    });
  });

  describe('Settlement', () => {
    it('splits the pool by share when the goal is met', async () => {
      const id = await insertContract('active', CONTRACT_PORT, { commodity: 'fuel', goal: 500, pool: 10000 });
      await addContribution(id, playerA, 300);
      await addContribution(id, playerB, 200);
      const beforeA = await getPlayer(playerA);
      const beforeB = await getPlayer(playerB);

      expect(await forceResolveEvent(id)).toBe(true);

      const afterA = await getPlayer(playerA);
      const afterB = await getPlayer(playerB);
      expect(Number(afterA.credits)).toBe(Number(beforeA.credits) + 6000);
      expect(Number(afterB.credits)).toBe(Number(beforeB.credits) + 4000);
      expect(6000 + 4000).toBe(10000);

      const rows = await contributions(id);
      expect(rows).toEqual([
        expect.objectContaining({ player_id: playerA, paid_credits: 6000 }),
        expect.objectContaining({ player_id: playerB, paid_credits: 4000 }),
      ]);

      // Settlement only ever adds credits.
      for (const key of ['cargo_fuel', 'cargo_organics', 'ship_fighters', 'ship_shields', 'ship_type']) {
        expect(afterA[key]).toEqual(beforeA[key]);
        expect(afterB[key]).toEqual(beforeB[key]);
      }

      const eventRow = await testPool.query(`SELECT params FROM dynamic_events WHERE id = $1`, [id]);
      expect(eventRow.rows[0].params.settlement.goalMet).toBe(true);
      expect(eventRow.rows[0].params.settlement.topContributorAmount).toBe(300);

      const msgs = await testPool.query(
        `SELECT subject, body FROM messages WHERE universe_id = $1 AND message_type = 'BROADCAST'`,
        [testUniverseId]
      );
      const resolution = msgs.rows.find((m: any) => /Fulfilled/.test(m.subject));
      expect(resolution).toBeDefined();
      expect(resolution.body).toContain('test_contract_user_a');
      expect(resolution.body).not.toMatch(/[\u2013\u2014]/);
    });

    it('pays half rate pro rata when the goal is missed', async () => {
      const id = await insertContract('active', CONTRACT_PORT, { commodity: 'fuel', goal: 500, pool: 10000 });
      await addContribution(id, playerA, 100);
      await addContribution(id, playerB, 100);
      const beforeA = await getPlayer(playerA);
      const beforeB = await getPlayer(playerB);

      expect(await forceResolveEvent(id)).toBe(true);

      expect(Number((await getPlayer(playerA)).credits)).toBe(Number(beforeA.credits) + 2500);
      expect(Number((await getPlayer(playerB)).credits)).toBe(Number(beforeB.credits) + 2500);
      const eventRow = await testPool.query(`SELECT params FROM dynamic_events WHERE id = $1`, [id]);
      expect(eventRow.rows[0].params.settlement.goalMet).toBe(false);
      expect(eventRow.rows[0].params.settlement.distributed).toBe(5000);
    });

    it('settles exactly once even if settlement runs again', async () => {
      const id = await insertContract('active', CONTRACT_PORT, { commodity: 'fuel', goal: 500, pool: 10000 });
      await addContribution(id, playerA, 500);
      const before = await getPlayer(playerA);

      expect(await forceResolveEvent(id)).toBe(true);
      const afterFirst = await getPlayer(playerA);
      expect(Number(afterFirst.credits)).toBe(Number(before.credits) + 10000);

      // A resolved event cannot be force resolved again.
      expect(await forceResolveEvent(id)).toBe(false);

      // And a direct second settlement pays nothing more.
      const eventRow = await testPool.query(`SELECT * FROM dynamic_events WHERE id = $1`, [id]);
      const summary = await withClient((client) =>
        settleContract(client, {
          id,
          params: { goal: 500, pool: 10000 },
        } as any)
      );
      expect(summary.distributed).toBe(0);
      expect(eventRow.rows[0].state).toBe('resolved');
      expect(Number((await getPlayer(playerA)).credits)).toBe(Number(afterFirst.credits));
      const rows = await contributions(id);
      expect(rows[0].paid_credits).toBe(10000);
    });

    it('pays nothing when nobody delivered', async () => {
      const id = await insertContract('active', CONTRACT_PORT, { commodity: 'fuel', goal: 500, pool: 10000 });
      const beforeA = await getPlayer(playerA);

      expect(await forceResolveEvent(id)).toBe(true);

      expect(Number((await getPlayer(playerA)).credits)).toBe(Number(beforeA.credits));
      expect(await contributions(id)).toEqual([]);
      const eventRow = await testPool.query(`SELECT params FROM dynamic_events WHERE id = $1`, [id]);
      expect(eventRow.rows[0].params.settlement.totalDelivered).toBe(0);

      const msgs = await testPool.query(
        `SELECT body FROM messages WHERE universe_id = $1 AND message_type = 'BROADCAST'`,
        [testUniverseId]
      );
      expect(msgs.rows.some((m: any) => /no deliveries/.test(m.body))).toBe(true);
    });

    it('force starts through the service path too', async () => {
      const event = await forceStartEvent(testUniverseId, 'contract');
      expect(event).not.toBeNull();
      expect(event!.type).toBe('contract');
    });
  });
});
