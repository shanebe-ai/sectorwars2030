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
const mockEmitPlayerEvent = jest.fn();
jest.mock('../index', () => ({
  emitSectorEvent: jest.fn(),
  emitUniverseEvent: jest.fn(),
  emitPlayerEvent: (...args: any[]) => mockEmitPlayerEvent(...args),
}));

// Import services after mocking
import {
  computeScanChance,
  regionalFactors,
  computeSnapshotPrice,
  getStealthMultiplier,
  scanPlayer,
  tradeContraband,
  buyAuction,
  getPlayerStatus,
  getMarketBoard,
  getSectorStashInfo,
  stashCargo,
  retrieveStash,
  runSmugglingTick,
  adminSpawnPatrol,
  adminClearPatrols,
  adminUpdateSettings,
  adminGetSettings,
  STASH_HOLD_LIMIT,
} from '../services/smugglingService';
import { getContrabandCatalog } from '../services/smugglingService';

describe('Smuggling System', () => {
  let userId: number;
  let otherUserId: number;
  let universeId: number;
  let playerId: number;
  let otherPlayerId: number;

  const cleanSmuggling = async () => {
    await testPool.query('DELETE FROM smuggling_log WHERE universe_id = $1', [universeId]);
    await testPool.query('DELETE FROM black_markets WHERE universe_id = $1', [universeId]);
    await testPool.query('DELETE FROM patrols WHERE universe_id = $1', [universeId]);
    await testPool.query('DELETE FROM contraband_auctions WHERE universe_id = $1', [universeId]);
    await testPool.query('DELETE FROM derelict_stashes WHERE universe_id = $1', [universeId]);
    await testPool.query('DELETE FROM smuggling_settings WHERE universe_id = $1', [universeId]);
    await testPool.query('DELETE FROM derelicts WHERE universe_id = $1', [universeId]);
    await testPool.query('DELETE FROM dynamic_events WHERE universe_id = $1', [universeId]);
    await testPool.query('DELETE FROM messages WHERE universe_id = $1', [universeId]);
  };

  const resetPlayer = async (
    id: number,
    overrides: Record<string, any> = {}
  ): Promise<void> => {
    const base: Record<string, any> = {
      current_sector: 150,
      credits: 10000,
      turns_remaining: 100,
      ship_holds_max: 100,
      ship_type: 'trader',
      ship_fighters: 25,
      ship_shields: 40,
      is_alive: true,
      cargo_fuel: 0,
      cargo_organics: 0,
      cargo_equipment: 0,
      cargo_banned_tech: 0,
      cargo_restricted_meds: 0,
      cargo_stolen_artifacts: 0,
      contraband_rep: 0,
      flagged_until: null,
    };
    const merged = { ...base, ...overrides };
    const sets = Object.keys(merged)
      .map((key, i) => `${key} = $${i + 2}`)
      .join(', ');
    await testPool.query(`UPDATE players SET ${sets} WHERE id = $1`, [
      id,
      ...Object.values(merged),
    ]);
  };

  const insertPort = async (sectorNumber: number, name: string) => {
    const res = await testPool.query(
      `INSERT INTO sectors (universe_id, sector_number, name, port_type, port_class)
       VALUES ($1, $2, $3, 'BBB', 5)
       ON CONFLICT (universe_id, sector_number) DO UPDATE SET port_type = 'BBB', port_class = 5, name = $3
       RETURNING id`,
      [universeId, sectorNumber, name]
    );
    return res.rows[0].id;
  };

  const openMarket = async (
    sectorNumber: number,
    portId: number,
    prices: Record<string, { buy: number; sell: number }>,
    closesSql = `NOW() + INTERVAL '4 hours'`
  ) => {
    await testPool.query(
      `INSERT INTO black_markets (universe_id, sector_number, port_id, is_open, opened_at, closes_at, premium_multiplier, prices, prices_as_of)
       VALUES ($1, $2, $3, TRUE, NOW(), ${closesSql}, 1.0, $4, NOW())
       ON CONFLICT (universe_id, sector_number)
       DO UPDATE SET is_open = TRUE, closes_at = ${closesSql}, prices = $4, prices_as_of = NOW()`,
      [universeId, sectorNumber, portId, JSON.stringify(prices)]
    );
  };

  beforeAll(async () => {
    await cleanupTestDb();

    userId = await createTestUser('test_smuggler');
    otherUserId = await createTestUser('test_smuggler_other');
    universeId = await createTestUniverse('Smuggling Test Universe', 1000);

    // Sectors: TerraSpace 5, plain 150 and 151, ports at 120 and 300
    await createTestSector(universeId, 5, 'Terra Sector');
    await createTestSector(universeId, 150, 'Open Space 150');
    await createTestSector(universeId, 151, 'Open Space 151');
    await insertPort(120, 'Port Halcyon');
    await insertPort(300, 'Port Meridian');

    playerId = await createTestPlayerWithStats(userId, universeId, 150, 10000, 25, 40, 100);
    otherPlayerId = await createTestPlayerWithStats(otherUserId, universeId, 150, 10000, 25, 40, 100);
  });

  beforeEach(async () => {
    await cleanSmuggling();
    await resetPlayer(playerId);
    await resetPlayer(otherPlayerId);
    mockEmitPlayerEvent.mockClear();
  });

  afterAll(async () => {
    await cleanupTestDb();
    await closeTestPool();
  });

  // ------------------------------------------------------------------
  describe('scan math', () => {
    it('never scans a clean hold', () => {
      expect(
        computeScanChance({
          contrabandUnits: 0,
          totalHoldUnits: 100,
          stealthMultiplier: 1,
          flagged: false,
          stormCover: false,
          incursionDistraction: false,
          settingsMultiplier: 1,
        })
      ).toBe(0);
    });

    it('scales with the contraband fraction of the hold', () => {
      const chance = computeScanChance({
        contrabandUnits: 10,
        totalHoldUnits: 100,
        stealthMultiplier: 1,
        flagged: false,
        stormCover: false,
        incursionDistraction: false,
        settingsMultiplier: 1,
      });
      expect(chance).toBeCloseTo(0.12 + 0.5 * 0.1, 5);
    });

    it('storm cover and incursion distraction cut the chance', () => {
      const base = {
        contrabandUnits: 50,
        totalHoldUnits: 100,
        stealthMultiplier: 1,
        flagged: false,
        settingsMultiplier: 1,
      };
      const clear = computeScanChance({ ...base, stormCover: false, incursionDistraction: false });
      const storm = computeScanChance({ ...base, stormCover: true, incursionDistraction: false });
      const distracted = computeScanChance({ ...base, stormCover: false, incursionDistraction: true });
      expect(storm).toBeCloseTo(clear * 0.35, 5);
      expect(distracted).toBeCloseTo(clear * 0.6, 5);
    });

    it('flagged pilots scan easier and stealth helps', () => {
      const base = {
        contrabandUnits: 50,
        totalHoldUnits: 100,
        stormCover: false,
        incursionDistraction: false,
        settingsMultiplier: 1,
      };
      const plain = computeScanChance({ ...base, stealthMultiplier: 1, flagged: false });
      const flagged = computeScanChance({ ...base, stealthMultiplier: 1, flagged: true });
      const stealthy = computeScanChance({ ...base, stealthMultiplier: 0.6, flagged: false });
      expect(flagged).toBeCloseTo(plain * 1.5, 5);
      expect(stealthy).toBeCloseTo(plain * 0.6, 5);
      expect(getStealthMultiplier('scout_marauder')).toBeLessThan(getStealthMultiplier('corporate_flagship'));
      expect(getStealthMultiplier('unknown_hull')).toBe(1);
    });

    it('is bounded at both ends', () => {
      const worst = computeScanChance({
        contrabandUnits: 100,
        totalHoldUnits: 100,
        stealthMultiplier: 1.4,
        flagged: true,
        stormCover: false,
        incursionDistraction: false,
        settingsMultiplier: 3,
      });
      expect(worst).toBe(0.85);
      const best = computeScanChance({
        contrabandUnits: 1,
        totalHoldUnits: 1000,
        stealthMultiplier: 0.5,
        flagged: false,
        stormCover: true,
        incursionDistraction: true,
        settingsMultiplier: 1,
      });
      expect(best).toBe(0.02);
    });
  });

  // ------------------------------------------------------------------
  describe('regional pricing', () => {
    it('home region is cheap to buy, demand region pays', async () => {
      const catalog = await getContrabandCatalog();
      const tech = catalog.find((g) => g.commodity === 'banned_tech')!;
      expect(regionalFactors(tech, 150)).toEqual({ buy: 0.55, sell: 0.75 }); // home 101-300
      expect(regionalFactors(tech, 800)).toEqual({ buy: 1.5, sell: 2.3 }); // demand 701-1000
      expect(regionalFactors(tech, 500)).toEqual({ buy: 1.0, sell: 1.25 }); // neither
    });

    it('a strike premium lands mostly on the sell side', async () => {
      const catalog = await getContrabandCatalog();
      const tech = catalog.find((g) => g.commodity === 'banned_tech')!;
      const plain = computeSnapshotPrice(tech, 800, 0, 1);
      const strike = computeSnapshotPrice(tech, 800, 0, 1.75);
      expect(strike.sell).toBeGreaterThan(plain.sell);
      expect(strike.sell / plain.sell).toBeCloseTo(1.75, 1);
      expect(strike.buy / plain.buy).toBeCloseTo(1.375, 1);
    });
  });

  // ------------------------------------------------------------------
  describe('scans and confiscation', () => {
    it('never scans in TerraSpace, even with a dirty hold and a rigged roll', async () => {
      await resetPlayer(playerId, { current_sector: 5, cargo_banned_tech: 20 });
      const result = await scanPlayer(playerId, () => 0);
      expect(result.scanned).toBe(false);
      const player = await getPlayer(playerId);
      expect(player.cargo_banned_tech).toBe(20);
    });

    it('a clean roll leaves the cargo and logs the scan', async () => {
      await resetPlayer(playerId, { cargo_banned_tech: 20 });
      const result = await scanPlayer(playerId, () => 0.999);
      expect(result.scanned).toBe(true);
      expect(result.confiscated).toBe(false);
      const player = await getPlayer(playerId);
      expect(player.cargo_banned_tech).toBe(20);
      const log = await testPool.query(
        `SELECT * FROM smuggling_log WHERE player_id = $1 AND event_type = 'scan_clean'`,
        [playerId]
      );
      expect(log.rows.length).toBe(1);
    });

    it('confiscation seizes contraband only, fines half the value, and never hurts the ship', async () => {
      await resetPlayer(playerId, {
        cargo_banned_tech: 10, // 10 x 300 = 3000 base value
        cargo_fuel: 30,
        credits: 10000,
      });
      const result = await scanPlayer(playerId, () => 0);
      expect(result.confiscated).toBe(true);

      const player = await getPlayer(playerId);
      expect(player.cargo_banned_tech).toBe(0);
      expect(player.cargo_fuel).toBe(30); // legal cargo untouched
      expect(parseInt(player.credits, 10)).toBe(10000 - 1500); // 50% fine
      expect(player.contraband_rep).toBe(2);
      expect(player.is_alive).toBe(true); // getting caught never destroys a ship
      expect(player.ship_fighters).toBe(25);
      expect(player.ship_shields).toBe(40);
      expect(player.flagged_until).toBeNull(); // first offence never flags
    });

    it('the fine never exceeds the credits on hand', async () => {
      await resetPlayer(playerId, { cargo_stolen_artifacts: 10, credits: 100 });
      await scanPlayer(playerId, () => 0);
      const player = await getPlayer(playerId);
      expect(parseInt(player.credits, 10)).toBe(0); // capped, never negative, never stranded
      expect(player.is_alive).toBe(true);
    });

    it('seized cargo is auctioned at the port of seizure', async () => {
      // Player is at sector 150; nearest ports are 120 and 300, so the
      // lot lands at 120.
      await resetPlayer(playerId, { cargo_restricted_meds: 8 });
      await scanPlayer(playerId, () => 0);
      const lots = await testPool.query(
        `SELECT * FROM contraband_auctions WHERE universe_id = $1`,
        [universeId]
      );
      expect(lots.rows.length).toBe(1);
      expect(lots.rows[0].sector_number).toBe(120);
      expect(lots.rows[0].commodity).toBe('restricted_meds');
      expect(lots.rows[0].quantity).toBe(8);
      expect(lots.rows[0].unit_price).toBe(Math.round(220 * 0.7));
      expect(lots.rows[0].seized_from).toBe(playerId);
    });
  });

  // ------------------------------------------------------------------
  describe('flagging', () => {
    it('flags only after the second confiscation, for 48 hours, and tells the player', async () => {
      await resetPlayer(playerId, { cargo_banned_tech: 5 });
      await scanPlayer(playerId, () => 0);
      let player = await getPlayer(playerId);
      expect(player.flagged_until).toBeNull();

      await resetPlayer(playerId, {
        cargo_banned_tech: 5,
        contraband_rep: player.contraband_rep,
      });
      await scanPlayer(playerId, () => 0);
      player = await getPlayer(playerId);
      expect(player.flagged_until).not.toBeNull();
      const until = new Date(player.flagged_until).getTime();
      expect(until - Date.now()).toBeGreaterThan(47 * 3600 * 1000);
      expect(until - Date.now()).toBeLessThan(49 * 3600 * 1000);

      // The player is told: inbox message plus a live event.
      const messages = await testPool.query(
        `SELECT * FROM messages WHERE recipient_id = $1 AND sender_name = 'Customs Patrol'`,
        [playerId]
      );
      expect(messages.rows.length).toBe(1);
      expect(mockEmitPlayerEvent).toHaveBeenCalledWith(
        playerId,
        'smuggling_flagged',
        expect.anything()
      );

      const status = await getPlayerStatus(userId);
      expect(status.flagged).toBe(true);
    });

    it('an expired flag is no longer visible', async () => {
      await testPool.query(
        `UPDATE players SET flagged_until = NOW() - INTERVAL '1 hour' WHERE id = $1`,
        [playerId]
      );
      const status = await getPlayerStatus(userId);
      expect(status.flagged).toBe(false);
    });
  });

  // ------------------------------------------------------------------
  describe('black market trading', () => {
    const prices = {
      banned_tech: { buy: 200, sell: 500 },
      restricted_meds: { buy: 150, sell: 320 },
      stolen_artifacts: { buy: 300, sell: 700 },
    };

    it('refuses a trade without the confirm step', async () => {
      const portId = await insertPort(120, 'Port Halcyon');
      await openMarket(120, portId, prices);
      await resetPlayer(playerId, { current_sector: 120 });
      await expect(
        tradeContraband(userId, 'banned_tech', 'buy', 1, false)
      ).rejects.toThrow(/confirm/i);
      const player = await getPlayer(playerId);
      expect(player.cargo_banned_tech).toBe(0);
    });

    it('refuses to trade where no market is open', async () => {
      await resetPlayer(playerId, { current_sector: 150 });
      await expect(
        tradeContraband(userId, 'banned_tech', 'buy', 1, true)
      ).rejects.toThrow(/no open black market/i);
    });

    it('buys and sells at the stale snapshot prices', async () => {
      const portId = await insertPort(120, 'Port Halcyon');
      await openMarket(120, portId, prices);
      await resetPlayer(playerId, { current_sector: 120, credits: 5000, contraband_rep: 3 });

      const bought = await tradeContraband(userId, 'banned_tech', 'buy', 4, true);
      expect(bought.totalCost).toBe(4 * 200);
      let player = await getPlayer(playerId);
      expect(player.cargo_banned_tech).toBe(4);
      expect(parseInt(player.credits, 10)).toBe(5000 - 800);
      expect(player.turns_remaining).toBe(99);

      // The snapshot does not move just because a trade happened.
      const market = await testPool.query(
        `SELECT prices FROM black_markets WHERE universe_id = $1 AND sector_number = 120`,
        [universeId]
      );
      expect(market.rows[0].prices.banned_tech.buy).toBe(200);

      const sold = await tradeContraband(userId, 'banned_tech', 'sell', 4, true);
      expect(sold.totalCost).toBe(4 * 500);
      player = await getPlayer(playerId);
      expect(player.cargo_banned_tech).toBe(0);
      expect(parseInt(player.credits, 10)).toBe(5000 - 800 + 2000);
      // A completed sell run is a clean run: reputation ticks down.
      expect(player.contraband_rep).toBe(2);
    });

    it('the market board is visible before arrival, with prices and their age', async () => {
      const portId = await insertPort(120, 'Port Halcyon');
      await openMarket(120, portId, prices);
      await resetPlayer(playerId, { current_sector: 150 }); // nowhere near the port
      const board = await getMarketBoard(userId);
      const halcyon = board.find((m) => m.sectorNumber === 120);
      expect(halcyon).toBeDefined();
      expect(halcyon.marketOpen).toBe(true);
      expect(halcyon.prices.banned_tech.buy).toBe(200);
      expect(halcyon.pricesAsOf).toBeTruthy();
    });
  });

  // ------------------------------------------------------------------
  describe('customs auctions', () => {
    it('buying a lot needs confirm and moves the goods into the hold', async () => {
      await resetPlayer(playerId, { current_sector: 120, credits: 5000 });
      const lot = await testPool.query(
        `INSERT INTO contraband_auctions (universe_id, sector_number, commodity, quantity, unit_price, seized_from, expires_at)
         VALUES ($1, 120, 'banned_tech', 6, 210, $2, NOW() + INTERVAL '24 hours')
         RETURNING id`,
        [universeId, otherPlayerId]
      );
      const lotId = lot.rows[0].id;

      await expect(buyAuction(userId, lotId, 2, false)).rejects.toThrow(/confirm/i);

      const result = await buyAuction(userId, lotId, 2, true);
      expect(result.quantity).toBe(2);
      const player = await getPlayer(playerId);
      expect(player.cargo_banned_tech).toBe(2);
      expect(parseInt(player.credits, 10)).toBe(5000 - 420);
      const remaining = await testPool.query(
        `SELECT quantity FROM contraband_auctions WHERE id = $1`,
        [lotId]
      );
      expect(remaining.rows[0].quantity).toBe(4);
    });
  });

  // ------------------------------------------------------------------
  describe('derelict stashes', () => {
    const insertClaimedDerelict = async (sectorNumber: number, claimedBy: number) => {
      const res = await testPool.query(
        `INSERT INTO derelicts (universe_id, sector_number, type, state, loot, claimed_by, expires_at)
         VALUES ($1, $2, 'wreck', 'claimed', '{}', $3, NOW() + INTERVAL '20 hours')
         RETURNING id`,
        [universeId, sectorNumber, claimedBy]
      );
      return res.rows[0].id;
    };

    it('stashes move cargo out of the hold and retrieval brings it back', async () => {
      const derelictId = await insertClaimedDerelict(150, playerId);
      await resetPlayer(playerId, { current_sector: 150, cargo_banned_tech: 10 });

      const stashed = await stashCargo(playerId, derelictId, 'banned_tech', 6);
      expect(stashed.success).toBe(true);
      let player = await getPlayer(playerId);
      expect(player.cargo_banned_tech).toBe(4); // stashed goods leave the scanned hold

      const info = await getSectorStashInfo(userId);
      expect(info.canStash).toBe(true);
      expect(info.stashes.length).toBe(1);
      expect(info.stashes[0].quantity).toBe(6);
      expect(info.stashes[0].mine).toBe(true);

      const retrieved = await retrieveStash(playerId, info.stashes[0].id);
      expect(retrieved.success).toBe(true);
      expect(retrieved.taken).toBe(6);
      player = await getPlayer(playerId);
      expect(player.cargo_banned_tech).toBe(10);
    });

    it('only the crew that cleared the wreck can stock its stash', async () => {
      const derelictId = await insertClaimedDerelict(150, otherPlayerId);
      await resetPlayer(playerId, { current_sector: 150, cargo_banned_tech: 5 });
      const result = await stashCargo(playerId, derelictId, 'banned_tech', 3);
      expect(result.success).toBe(false);
      const player = await getPlayer(playerId);
      expect(player.cargo_banned_tech).toBe(5);
    });

    it('respects the stash hold limit', async () => {
      const derelictId = await insertClaimedDerelict(150, playerId);
      await resetPlayer(playerId, { current_sector: 150, cargo_banned_tech: 60 });
      const first = await stashCargo(playerId, derelictId, 'banned_tech', STASH_HOLD_LIMIT);
      expect(first.success).toBe(true);
      const second = await stashCargo(playerId, derelictId, 'banned_tech', 1);
      expect(second.success).toBe(false);
    });

    it('another crew can loot the stash, and the heist is logged', async () => {
      const derelictId = await insertClaimedDerelict(150, playerId);
      await resetPlayer(playerId, { current_sector: 150, cargo_restricted_meds: 7 });
      await stashCargo(playerId, derelictId, 'restricted_meds', 7);

      const info = await getSectorStashInfo(otherUserId);
      expect(info.stashes.length).toBe(1);
      expect(info.stashes[0].mine).toBe(false); // visible, but the owner is never named

      await resetPlayer(otherPlayerId, { current_sector: 150 });
      const looted = await retrieveStash(otherPlayerId, info.stashes[0].id);
      expect(looted.success).toBe(true);
      expect(looted.taken).toBe(7);
      const thief = await getPlayer(otherPlayerId);
      expect(thief.cargo_restricted_meds).toBe(7);

      const log = await testPool.query(
        `SELECT * FROM smuggling_log WHERE player_id = $1 AND event_type = 'stash_loot'`,
        [otherPlayerId]
      );
      expect(log.rows.length).toBe(1);
    });
  });

  // ------------------------------------------------------------------
  describe('the tick', () => {
    it('spawns patrols outside TerraSpace and retires expired ones', async () => {
      await testPool.query(
        `INSERT INTO patrols (universe_id, sector_number, expires_at)
         VALUES ($1, 150, NOW() - INTERVAL '1 hour')`,
        [universeId]
      );
      await runSmugglingTick();

      const patrols = await testPool.query(
        `SELECT * FROM patrols WHERE universe_id = $1`,
        [universeId]
      );
      expect(patrols.rows.length).toBeGreaterThan(0);
      for (const patrol of patrols.rows) {
        expect(patrol.sector_number).toBeGreaterThan(10);
        expect(new Date(patrol.expires_at).getTime()).toBeGreaterThan(Date.now());
      }
      await adminClearPatrols(universeId);
    }, 30000);

    it('closes markets that ran past their window', async () => {
      const portId = await insertPort(120, 'Port Halcyon');
      await openMarket(120, portId, { banned_tech: { buy: 1, sell: 2 } }, `NOW() - INTERVAL '1 hour'`);
      await runSmugglingTick();
      const market = await testPool.query(
        `SELECT is_open FROM black_markets WHERE universe_id = $1 AND sector_number = 120`,
        [universeId]
      );
      expect(market.rows[0].is_open).toBe(false);
      await adminClearPatrols(universeId);
    }, 30000);

    it('refreshes open market price snapshots on the tick', async () => {
      const portId = await insertPort(120, 'Port Halcyon');
      await openMarket(120, portId, { banned_tech: { buy: 1, sell: 2 } });
      await testPool.query(
        `UPDATE black_markets SET prices_as_of = NOW() - INTERVAL '1 hour' WHERE universe_id = $1`,
        [universeId]
      );
      await runSmugglingTick();
      const market = await testPool.query(
        `SELECT prices, prices_as_of FROM black_markets WHERE universe_id = $1 AND sector_number = 120`,
        [universeId]
      );
      // Banned tech at sector 120 is home region: buy 300 x 0.55 = 165
      expect(market.rows[0].prices.banned_tech.buy).toBe(165);
      expect(Date.now() - new Date(market.rows[0].prices_as_of).getTime()).toBeLessThan(60000);
      await adminClearPatrols(universeId);
    }, 30000);

    it('decays reputation for pilots who have not been caught lately', async () => {
      await resetPlayer(playerId, { contraband_rep: 3 });
      await resetPlayer(otherPlayerId, { contraband_rep: 3 });
      // The other pilot was caught an hour ago: no decay yet.
      await testPool.query(
        `INSERT INTO smuggling_log (universe_id, player_id, event_type, sector_number, details)
         VALUES ($1, $2, 'confiscation', 150, '{}')`,
        [universeId, otherPlayerId]
      );
      await runSmugglingTick();
      const clean = await getPlayer(playerId);
      const caught = await getPlayer(otherPlayerId);
      expect(clean.contraband_rep).toBe(2);
      expect(caught.contraband_rep).toBe(3);
      await adminClearPatrols(universeId);
    }, 30000);
  });

  // ------------------------------------------------------------------
  describe('admin patrol controls', () => {
    it('force spawn refuses TerraSpace', async () => {
      await expect(adminSpawnPatrol(universeId, 5)).rejects.toThrow(/TerraSpace/);
      const patrol = await adminSpawnPatrol(universeId, 150);
      expect(patrol.sector_number).toBe(150);
      const removed = await adminClearPatrols(universeId);
      expect(removed).toBe(1);
    });

    it('scan chance tuning persists per universe', async () => {
      const updated = await adminUpdateSettings(universeId, { scanChanceMultiplier: 2.5, patrolCount: 7 });
      expect(updated.scanChanceMultiplier).toBeCloseTo(2.5);
      expect(updated.patrolCount).toBe(7);
      const settings = await adminGetSettings(universeId);
      expect(settings.patrolCount).toBe(7);
    });
  });
});
