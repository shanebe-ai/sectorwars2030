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

// Import services after mocking
import { runNpcTick, getNpcShipsInSector, hailNpc } from '../services/npcService';

describe('NPC Traffic System', () => {
  let testUserId: number;
  let testUniverseId: number;
  let testPlayerId: number;

  const insertNpc = async (overrides: {
    name?: string;
    sector: number;
    route?: number[];
    destination?: number | null;
    cargoEquipment?: number;
  }): Promise<number> => {
    const res = await testPool.query(
      `INSERT INTO npc_ships
         (universe_id, name, ship_name, ship_type, current_sector,
          destination_sector, route, cargo_equipment, holds_max, credits)
       VALUES ($1, $2, 'Test Hull', 'trader', $3, $4, $5, $6, 50, 10000)
       RETURNING id`,
      [
        testUniverseId,
        overrides.name || 'Mara Voss',
        overrides.sector,
        overrides.destination ?? null,
        JSON.stringify(overrides.route || []),
        overrides.cargoEquipment || 0,
      ]
    );
    return res.rows[0].id;
  };

  beforeAll(async () => {
    await testPool.query(`DELETE FROM npc_ships`);
    await cleanupTestDb();

    testUserId = await createTestUser('test_npc_user');
    testUniverseId = await createTestUniverse('NPC Test Universe', 100);

    for (let s = 11; s <= 30; s++) {
      await createTestSector(testUniverseId, s, `NPC Sector ${s}`);
    }

    // Warp chain 20 - 21 - 22 - 23 - 24 - 25 so NPCs can path between ports
    const sectorId = async (n: number) =>
      (await testPool.query(
        `SELECT id FROM sectors WHERE universe_id = $1 AND sector_number = $2`,
        [testUniverseId, n]
      )).rows[0].id;
    for (const [from, to] of [[20, 21], [21, 22], [22, 23], [23, 24], [24, 25]] as const) {
      await createWarp(await sectorId(from), to, true);
      await createWarp(await sectorId(to), from, true);
    }

    // Ports at 20 (BBS) and 25 (SSB)
    await testPool.query(
      `UPDATE sectors SET port_type = 'BBS', port_class = 5,
              port_fuel_qty = 500, port_organics_qty = 500, port_equipment_qty = 500,
              port_fuel_pct = 100, port_organics_pct = 100, port_equipment_pct = 100
       WHERE universe_id = $1 AND sector_number = 20`,
      [testUniverseId]
    );
    await testPool.query(
      `UPDATE sectors SET port_type = 'SSB', port_class = 4,
              port_fuel_qty = 500, port_organics_qty = 500, port_equipment_qty = 100,
              port_fuel_pct = 100, port_organics_pct = 100, port_equipment_pct = 100
       WHERE universe_id = $1 AND sector_number = 25`,
      [testUniverseId]
    );

    testPlayerId = await createTestPlayerWithStats(
      testUserId,
      testUniverseId,
      20,
      50000,
      10,
      10,
      100
    );
  });

  afterAll(async () => {
    await testPool.query(`DELETE FROM npc_ships`);
    await testPool.query(`DELETE FROM port_economy`);
    await cleanupTestDb();
    await closeTestPool();
  });

  beforeEach(async () => {
    await testPool.query(`DELETE FROM npc_ships WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(`DELETE FROM port_economy WHERE universe_id = $1`, [testUniverseId]);
    await testPool.query(
      `UPDATE sectors SET port_fuel_qty = 500, port_organics_qty = 500, port_equipment_qty = 100
       WHERE universe_id = $1 AND sector_number = 25`,
      [testUniverseId]
    );
    await testPool.query(
      `UPDATE players SET current_sector = 20 WHERE id = $1`,
      [testPlayerId]
    );
  });

  describe('Seeding', () => {
    it('populates a fixed pool of named traders per universe', async () => {
      await runNpcTick();

      const rows = await testPool.query(
        `SELECT name FROM npc_ships WHERE universe_id = $1 ORDER BY name`,
        [testUniverseId]
      );
      expect(rows.rows.length).toBe(8);
      const names = rows.rows.map((r: any) => r.name);
      expect(names).toContain('Mara Voss');
      expect(names).toContain('Mother Okonkwo');

      // A second tick does not duplicate the roster
      await runNpcTick();
      const again = await testPool.query(
        `SELECT COUNT(*) AS count FROM npc_ships WHERE universe_id = $1`,
        [testUniverseId]
      );
      expect(parseInt(again.rows[0].count, 10)).toBe(8);
    });

    it('shows NPC ships in the sector they occupy', async () => {
      const npcId = await insertNpc({ sector: 20 });
      const inSector = await getNpcShipsInSector(testUniverseId, 20);
      expect(inSector).toHaveLength(1);
      expect(inSector[0].id).toBe(npcId);
      expect(inSector[0].name).toBe('Mara Voss');

      const elsewhere = await getNpcShipsInSector(testUniverseId, 29);
      expect(elsewhere).toHaveLength(0);
    });
  });

  describe('Movement', () => {
    it('warps an idle NPC along a planned route toward a port', async () => {
      const npcId = await insertNpc({ sector: 20 });
      await runNpcTick();

      const row = await testPool.query(
        `SELECT current_sector, route FROM npc_ships WHERE id = $1`,
        [npcId]
      );
      // It either set off toward a port (moved up to two hops) or holds
      // a planned route; it never stays parked with nothing planned.
      const moved = row.rows[0].current_sector !== 20;
      const planned = Array.isArray(row.rows[0].route) && row.rows[0].route.length > 0;
      expect(moved || planned).toBe(true);
      if (moved) {
        expect([21, 22, 23, 24, 25]).toContain(row.rows[0].current_sector);
      }
    });
  });

  describe('Trading', () => {
    it('sells cargo at a port that buys it, moving real stock and drift', async () => {
      // Route ends at port 25 (SSB buys equipment), two hops away
      const npcId = await insertNpc({
        sector: 23,
        route: [24, 25],
        destination: 25,
        cargoEquipment: 5,
      });

      await runNpcTick();

      const npc = await testPool.query(`SELECT * FROM npc_ships WHERE id = $1`, [npcId]);
      expect(npc.rows[0].current_sector).toBe(25);
      expect(npc.rows[0].cargo_equipment).toBeLessThan(5);
      expect(npc.rows[0].credits).toBeGreaterThan(10000);

      const port = await testPool.query(
        `SELECT port_equipment_qty FROM sectors
         WHERE universe_id = $1 AND sector_number = 25`,
        [testUniverseId]
      );
      expect(port.rows[0].port_equipment_qty).toBeGreaterThan(100);

      const volume = await testPool.query(
        `SELECT volume_sold FROM port_economy
         WHERE universe_id = $1 AND sector_number = 25 AND commodity = 'equipment'`,
        [testUniverseId]
      );
      expect(volume.rows.length).toBe(1);
      expect(volume.rows[0].volume_sold).toBeGreaterThan(0);
    });
  });

  describe('Hail', () => {
    it('answers with a market tip when the NPC shares your sector', async () => {
      const npcId = await insertNpc({ sector: 20 });
      // Seed a hot market so the tip has something specific to say
      await testPool.query(
        `INSERT INTO port_economy (universe_id, sector_number, commodity, drift)
         VALUES ($1, 25, 'fuel', 0.3)`,
        [testUniverseId]
      );

      const result = await hailNpc(testPlayerId, npcId);
      expect(result.success).toBe(true);
      expect(result.npcName).toBe('Mara Voss');
      expect(result.message).toContain('Sector 25');
      expect(result.message).toContain('fuel');
    });

    it('goes unanswered when the NPC is in another sector', async () => {
      const npcId = await insertNpc({ sector: 25 });
      const result = await hailNpc(testPlayerId, npcId);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/not in this sector/i);
    });
  });
});
