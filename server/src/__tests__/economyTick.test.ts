import {
  getTestPool,
  cleanupTestDb,
  createTestUniverse,
  createTestSector,
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

import { runEconomyTick } from '../services/economyService';

describe('Economy tick', () => {
  let universeId: number;

  beforeAll(async () => {
    await cleanupTestDb();
    universeId = await createTestUniverse('Economy Tick Universe', 50);
    await createTestSector(universeId, 30, 'Restock Port');
    await testPool.query(
      `UPDATE sectors SET port_type = 'BBS', port_fuel_qty = 500, port_organics_qty = 1000, port_equipment_qty = 1500
       WHERE universe_id = $1 AND sector_number = 30`,
      [universeId]
    );
  });

  afterAll(async () => {
    await testPool.query(`DELETE FROM port_economy WHERE universe_id = $1`, [universeId]);
    await cleanupTestDb();
    await closeTestPool();
  });

  it('runs without errors and restocks ports toward 1000', async () => {
    const errorSpy = jest.spyOn(console, 'error');
    await runEconomyTick();
    expect(errorSpy).not.toHaveBeenCalledWith('[Economy] Tick error:', expect.anything());
    errorSpy.mockRestore();

    const port = await testPool.query(
      `SELECT port_fuel_qty, port_organics_qty, port_equipment_qty FROM sectors
       WHERE universe_id = $1 AND sector_number = 30`,
      [universeId]
    );
    expect(port.rows[0].port_fuel_qty).toBe(550);
    expect(port.rows[0].port_organics_qty).toBe(1000);
    expect(port.rows[0].port_equipment_qty).toBe(1500);
  });

  it('clears economy events that have run out (later steps of the tick run)', async () => {
    await testPool.query(
      `INSERT INTO port_economy (universe_id, sector_number, commodity, event_state, event_ends_at)
       VALUES ($1, 30, 'fuel', 'scarcity', NOW() - INTERVAL '1 minute')
       ON CONFLICT (universe_id, sector_number, commodity)
       DO UPDATE SET event_state = 'scarcity', event_ends_at = NOW() - INTERVAL '1 minute'`,
      [universeId]
    );
    jest.spyOn(Math, 'random').mockReturnValue(0.99); // no new events
    await runEconomyTick();
    (Math.random as jest.Mock).mockRestore();

    const row = await testPool.query(
      `SELECT event_state FROM port_economy WHERE universe_id = $1 AND sector_number = 30 AND commodity = 'fuel'`,
      [universeId]
    );
    expect(row.rows[0].event_state).toBe('none');
  });
});
