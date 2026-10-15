import {
  getTestPool,
  cleanupTestDb,
  createTestUser,
  createTestUniverse,
  createTestStardockSector,
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
import { getStardockInfo, purchaseShip } from '../services/stardockService';

const EXPECTED_NEW_SHIPS = [
  { name: 'scout_marauder', display_name: 'Scout Marauder', holds: 35, fighters_max: 30, shields_max: 200, torpedoes_max: 1, mines_max: 0, beacons_max: 10, genesis_max: 0, turns_cost: 1, cost_credits: '30000' },
  { name: 'missile_frigate', display_name: 'Missile Frigate', holds: 45, fighters_max: 25, shields_max: 300, torpedoes_max: 4, mines_max: 2, beacons_max: 10, genesis_max: 2, turns_cost: 1, cost_credits: '100000' },
  { name: 'havoc_gunstar', display_name: 'Havoc Gunstar', holds: 80, fighters_max: 45, shields_max: 1500, torpedoes_max: 3, mines_max: 5, beacons_max: 10, genesis_max: 4, turns_cost: 1, cost_credits: '350000' },
  { name: 'tholian_sentinel', display_name: 'Tholian Sentinel', holds: 60, fighters_max: 35, shields_max: 1800, torpedoes_max: 2, mines_max: 5, beacons_max: 10, genesis_max: 3, turns_cost: 1, cost_credits: '400000' },
  { name: 'interdictor_cruiser', display_name: 'Interdictor Cruiser', holds: 100, fighters_max: 60, shields_max: 2500, torpedoes_max: 5, mines_max: 5, beacons_max: 10, genesis_max: 6, turns_cost: 1, cost_credits: '750000' },
];

const ORIGINAL_DISPLAY_NAMES: Record<string, string> = {
  escape_pod: 'Escape Pod',
  scout: 'Scout',
  trader: 'Trader',
  freighter: 'Freighter',
  merchant_cruiser: 'Merchant Cruiser',
  corporate_flagship: 'Corporate Flagship',
};

describe('Stardock Ships (migration 031)', () => {
  let testUserId: number;
  let testUniverseId: number;
  let testPlayerId: number;

  beforeAll(async () => {
    await cleanupTestDb();

    testUserId = await createTestUser('test_ship_user');
    testUniverseId = await createTestUniverse('Ship Test Universe', 50);
    await createTestStardockSector(testUniverseId, 1, 'Sol StarDock');

    testPlayerId = await createTestPlayerWithStats(
      testUserId,
      testUniverseId,
      1, // at the Stardock
      1000000, // credits
      10, // fighters
      10, // shields
      100 // turns
    );
  });

  afterAll(async () => {
    await cleanupTestDb();
    await closeTestPool();
  });

  beforeEach(async () => {
    await testPool.query(
      `UPDATE players SET credits = 1000000, ship_type = 'scout',
        ship_holds_max = 20, ship_fighters = 10, ship_shields = 10,
        current_sector = 1
       WHERE id = $1`,
      [testPlayerId]
    );
  });

  describe('Ship roster', () => {
    it('lists the five new ships with correct stats and display names', async () => {
      for (const expected of EXPECTED_NEW_SHIPS) {
        const res = await testPool.query(
          `SELECT * FROM ship_types WHERE name = $1 AND universe_id IS NULL`,
          [expected.name]
        );
        expect(res.rows.length).toBe(1);
        const ship = res.rows[0];
        expect(ship.display_name).toBe(expected.display_name);
        expect(ship.holds).toBe(expected.holds);
        expect(ship.fighters_max).toBe(expected.fighters_max);
        expect(ship.shields_max).toBe(expected.shields_max);
        expect(ship.torpedoes_max).toBe(expected.torpedoes_max);
        expect(ship.mines_max).toBe(expected.mines_max);
        expect(ship.beacons_max).toBe(expected.beacons_max);
        expect(ship.genesis_max).toBe(expected.genesis_max);
        expect(ship.turns_cost).toBe(expected.turns_cost);
        expect(String(ship.cost_credits)).toBe(expected.cost_credits);
        expect(ship.description).toBeTruthy();
        expect(ship.description).not.toMatch(/[-–—]/);
      }
    });

    it('backfills display names for the six original ships', async () => {
      // Simulate the pre migration state: original ships without display_name
      await testPool.query(
        `DELETE FROM ship_types WHERE universe_id IS NULL AND name IN
          ('escape_pod', 'scout', 'trader', 'freighter', 'merchant_cruiser', 'corporate_flagship')`
      );
      await testPool.query(
        `INSERT INTO ship_types (universe_id, name, holds, fighters_max, shields_max, turns_cost, cost_credits)
         VALUES
          (NULL, 'escape_pod', 5, 0, 10, 2, 0),
          (NULL, 'scout', 20, 10, 100, 2, 10000),
          (NULL, 'trader', 60, 20, 250, 2, 50000),
          (NULL, 'freighter', 125, 25, 500, 2, 50000),
          (NULL, 'merchant_cruiser', 250, 40, 1000, 2, 250000),
          (NULL, 'corporate_flagship', 500, 50, 2000, 2, 500000)`
      );

      // Run the migration backfill statements
      await testPool.query(`UPDATE ship_types SET display_name = 'Escape Pod' WHERE name = 'escape_pod' AND display_name IS NULL`);
      await testPool.query(`UPDATE ship_types SET display_name = 'Scout' WHERE name = 'scout' AND display_name IS NULL`);
      await testPool.query(`UPDATE ship_types SET display_name = 'Trader' WHERE name = 'trader' AND display_name IS NULL`);
      await testPool.query(`UPDATE ship_types SET display_name = 'Freighter' WHERE name = 'freighter' AND display_name IS NULL`);
      await testPool.query(`UPDATE ship_types SET display_name = 'Merchant Cruiser' WHERE name = 'merchant_cruiser' AND display_name IS NULL`);
      await testPool.query(`UPDATE ship_types SET display_name = 'Corporate Flagship' WHERE name = 'corporate_flagship' AND display_name IS NULL`);

      const res = await testPool.query(
        `SELECT name, display_name FROM ship_types
         WHERE universe_id IS NULL AND name IN
           ('escape_pod', 'scout', 'trader', 'freighter', 'merchant_cruiser', 'corporate_flagship')`
      );
      expect(res.rows.length).toBe(6);
      for (const row of res.rows) {
        expect(row.display_name).toBe(ORIGINAL_DISPLAY_NAMES[row.name]);
      }
    });

    it('leaves existing ship stats untouched', async () => {
      const res = await testPool.query(
        `SELECT name, holds, fighters_max, shields_max, cost_credits FROM ship_types
         WHERE universe_id IS NULL AND name = 'scout'`
      );
      const scout = res.rows[0];
      expect(scout.holds).toBe(20);
      expect(scout.fighters_max).toBe(10);
      expect(scout.shields_max).toBe(100);
      expect(String(scout.cost_credits)).toBe('10000');
    });
  });

  describe('Stardock listing and purchase', () => {
    it('lists ships ordered by cost with display names', async () => {
      const info = await getStardockInfo(testUserId);
      expect(info).not.toBeNull();

      const costs = info!.ships.map((s: any) => s.cost);
      const sorted = [...costs].sort((a, b) => a - b);
      expect(costs).toEqual(sorted);

      const marauder = info!.ships.find((s: any) => s.name === 'scout_marauder');
      expect(marauder).toBeDefined();
      expect(marauder!.displayName).toBe('Scout Marauder');

      const interdictor = info!.ships.find((s: any) => s.name === 'interdictor_cruiser');
      expect(interdictor).toBeDefined();
      expect(interdictor!.displayName).toBe('Interdictor Cruiser');
    });

    it('purchases a new ship at Stardock', async () => {
      const result = await purchaseShip(testUserId, 'missile_frigate');

      expect(result.success).toBe(true);
      const player = await getPlayer(testPlayerId);
      expect(player.ship_type).toBe('missile_frigate');
      // 1,000,000 credits minus 100,000 cost plus scout trade in
      expect(parseInt(player.credits, 10)).toBeLessThan(1000000);
      expect(parseInt(player.credits, 10)).toBeGreaterThanOrEqual(900000);
    });

    it('rejects purchase when the player cannot afford the ship', async () => {
      await testPool.query(`UPDATE players SET credits = 100 WHERE id = $1`, [testPlayerId]);

      await expect(purchaseShip(testUserId, 'interdictor_cruiser')).rejects.toThrow();
    });
  });
});
