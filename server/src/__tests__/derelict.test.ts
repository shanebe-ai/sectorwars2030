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

// Import services after mocking
import {
  runDerelictTick,
  boardDerelict,
  getDerelictInSector,
} from '../services/derelictService';
import { resolveCombatRounds } from '../services/combatService';

describe('Derelict System', () => {
  let testUserId: number;
  let testUniverseId: number;
  let testPlayerId: number;

  const insertDerelict = async (
    sectorNumber: number,
    type: 'wreck' | 'ghost' | 'liner',
    loot: any = {},
    expiresSql = `NOW() + INTERVAL '20 hours'`
  ) => {
    const res = await testPool.query(
      `INSERT INTO derelicts (universe_id, sector_number, type, state, loot, expires_at)
       VALUES ($1, $2, $3, 'spotted', $4, ${expiresSql})
       ON CONFLICT (universe_id, sector_number) DO NOTHING
       RETURNING id`,
      [testUniverseId, sectorNumber, type, JSON.stringify(loot)]
    );
    return res.rows[0]?.id;
  };

  beforeAll(async () => {
    await cleanupTestDb();

    testUserId = await createTestUser('test_derelict_user');
    testUniverseId = await createTestUniverse('Derelict Test Universe', 100);

    // Sectors 11..30 for spawning and boarding (outside TerraSpace)
    for (let s = 11; s <= 30; s++) {
      await createTestSector(testUniverseId, s, `Derelict Sector ${s}`);
    }
    // A port sector that must never host a derelict
    await testPool.query(
      `INSERT INTO sectors (universe_id, sector_number, name, port_type, port_class)
       VALUES ($1, 40, 'Port Sector', 'BBB', 5)
       ON CONFLICT DO NOTHING`,
      [testUniverseId]
    );

    // Player in sector 15 with roomy hold, strong ship
    testPlayerId = await createTestPlayerWithStats(
      testUserId,
      testUniverseId,
      15,
      50000, // credits
      200, // fighters
      200, // shields
      100 // turns
    );
    await testPool.query(
      `UPDATE players SET ship_holds_max = 200 WHERE id = $1`,
      [testPlayerId]
    );
  });

  afterAll(async () => {
    await cleanupTestDb();
    await closeTestPool();
  });

  beforeEach(async () => {
    await testPool.query(`DELETE FROM derelicts WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(
      `UPDATE players SET turns_remaining = 100, current_sector = 15,
        cargo_fuel = 0, cargo_organics = 0, cargo_equipment = 0,
        credits = 50000, ship_fighters = 200, ship_shields = 200,
        ship_type = 'scout', ship_holds_max = 200
       WHERE id = $1`,
      [testPlayerId]
    );
  });

  describe('Tick: expiry and spawn rules', () => {
    it('expires derelicts past their expiry window', async () => {
      await insertDerelict(16, 'wreck', {}, `NOW() - INTERVAL '1 hour'`);
      await insertDerelict(17, 'wreck', {}, `NOW() + INTERVAL '20 hours'`);

      await runDerelictTick();

      const res = await testPool.query(
        `SELECT sector_number FROM derelicts WHERE universe_id = $1`,
        [testUniverseId]
      );
      const sectors = res.rows.map((r: any) => r.sector_number);
      expect(sectors).not.toContain(16);
      expect(sectors).toContain(17);
    });

    it('respects the 5 active derelict cap per universe', async () => {
      for (let s = 11; s <= 15; s++) {
        await insertDerelict(s, 'wreck', {});
      }
      for (let i = 0; i < 30; i++) {
        await runDerelictTick();
      }
      const res = await testPool.query(
        `SELECT COUNT(*) AS count FROM derelicts
         WHERE universe_id = $1 AND state != 'claimed'`,
        [testUniverseId]
      );
      expect(parseInt(res.rows[0].count, 10)).toBeLessThanOrEqual(5);
    });

    it('never spawns in TerraSpace or port sectors', async () => {
      for (let i = 0; i < 60; i++) {
        await runDerelictTick();
      }
      const res = await testPool.query(
        `SELECT sector_number FROM derelicts WHERE universe_id = $1`,
        [testUniverseId]
      );
      for (const row of res.rows) {
        expect(row.sector_number).toBeGreaterThan(10);
        expect(row.sector_number).not.toBe(40);
      }
    });
  });

  describe('Boarding', () => {
    it('boarding a wreck credits loot to the hold and costs 3 turns', async () => {
      await insertDerelict(15, 'wreck', { fuel: 30, organics: 20, equipment: 10, credits: 0 });

      const result = await boardDerelict(testPlayerId, 'loot');

      expect(result.success).toBe(true);
      const player = await getPlayer(testPlayerId);
      expect(player.cargo_fuel).toBe(30);
      expect(player.cargo_organics).toBe(20);
      expect(player.cargo_equipment).toBe(10);
      expect(player.turns_remaining).toBe(97);

      const derelict = await getDerelictInSector(testUniverseId, 15);
      expect(derelict).toBeNull(); // claimed derelicts are gone from the active view
    });

    it('caps loot at free hold space', async () => {
      await testPool.query(`UPDATE players SET ship_holds_max = 20 WHERE id = $1`, [testPlayerId]);
      await insertDerelict(15, 'wreck', { fuel: 100, organics: 100, equipment: 100, credits: 0 });

      const result = await boardDerelict(testPlayerId, 'loot');

      expect(result.success).toBe(true);
      const player = await getPlayer(testPlayerId);
      const total = player.cargo_fuel + player.cargo_organics + player.cargo_equipment;
      expect(total).toBe(20);
      // Equipment has priority by value
      expect(player.cargo_equipment).toBe(20);
    });

    it('locks the derelict so a second boarding fails', async () => {
      await insertDerelict(15, 'wreck', { fuel: 10, organics: 0, equipment: 0, credits: 0 });

      const first = await boardDerelict(testPlayerId, 'loot');
      expect(first.success).toBe(true);

      const second = await boardDerelict(testPlayerId, 'loot');
      expect(second.success).toBe(false);
    });

    it('requires the player to be in the derelict sector', async () => {
      await insertDerelict(16, 'wreck', { fuel: 10, organics: 0, equipment: 0, credits: 0 });

      const result = await boardDerelict(testPlayerId, 'loot');
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/sector/i);
    });

    it('ghost ship boarding resolves combat and pays richer loot on victory', async () => {
      await insertDerelict(15, 'ghost', { fuel: 50, organics: 40, equipment: 30, credits: 8000 });

      const result = await boardDerelict(testPlayerId, 'loot');

      // 200 fighters vs 20-40 automated defenses: near certain victory
      expect(result.success).toBe(true);
      expect(result.combat?.victory).toBe(true);
      expect(result.loot?.credits).toBe(8000);
      const player = await getPlayer(testPlayerId);
      expect(parseInt(player.credits, 10)).toBe(58000);
    });

    it('losing to a ghost ship leaves the derelict spotted for the next crew', async () => {
      await testPool.query(
        `UPDATE players SET ship_fighters = 1, ship_shields = 0 WHERE id = $1`,
        [testPlayerId]
      );
      await insertDerelict(15, 'ghost', { fuel: 50, organics: 40, equipment: 30, credits: 8000 });

      const result = await boardDerelict(testPlayerId, 'loot');

      expect(result.success).toBe(false);
      expect(result.combat?.victory).toBe(false);
      const row = await testPool.query(
        `SELECT state FROM derelicts WHERE universe_id = $1 AND sector_number = 15`,
        [testUniverseId]
      );
      expect(row.rows[0].state).toBe('spotted');
    });

    it('liner claim_sell pays the flat bounty', async () => {
      await insertDerelict(15, 'liner', {});

      const result = await boardDerelict(testPlayerId, 'claim_sell');

      expect(result.success).toBe(true);
      const player = await getPlayer(testPlayerId);
      expect(parseInt(player.credits, 10)).toBe(250000);
    });

    it('liner claim_swap upgrades a cheap hull', async () => {
      await insertDerelict(15, 'liner', {});

      const result = await boardDerelict(testPlayerId, 'claim_swap');

      expect(result.success).toBe(true);
      const player = await getPlayer(testPlayerId);
      expect(player.ship_type).toBe('merchant_cruiser');
      expect(player.ship_holds_max).toBe(250);
    });
  });

  describe('Ion storm combat', () => {
    it('zeroes shield losses for both sides when ionStorm is set', async () => {
      const result = resolveCombatRounds(50, 100, 50, 100, { ionStorm: true });
      expect(result.attackerShieldsLost).toBe(0);
      expect(result.defenderShieldsLost).toBe(0);
      // Fighters still fight and die
      expect(result.attackerFightersLost + result.defenderFightersLost).toBeGreaterThan(0);
    });

    it('shields absorb damage normally without an ion storm', async () => {
      const result = resolveCombatRounds(50, 100, 50, 100, {});
      expect(result.defenderShieldsLost).toBeGreaterThan(0);
    });
  });
});
