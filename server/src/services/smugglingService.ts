import { pool, query } from '../db/connection';
import { emitPlayerEvent, emitUniverseEvent } from '../index';
import { broadcastTNN } from './broadcastService';
import { getLiveEvents, getStrikeForSector } from './dynamicEventService';

// Smuggling: contraband goods, black markets, customs patrols, derelict
// stashes and customs auctions. Driven by a tick on the same 5 minute
// cadence as the economy, derelict and dynamic event ticks.
//
// Fairness rules baked in (the standing rules from the spec):
// * Fully opt in. Contraband only enters a hold through an explicit,
//   confirmed purchase (black market or customs auction).
// * Patrols never operate in TerraSpace (sectors 1 to 10).
// * Getting caught costs cargo, a fine and reputation. It never
//   destroys a ship, cargo beyond the contraband, or strands anyone.
//
// Locked decisions (Oct 22, 2026):
// * Black market prices are visible before arrival but stale: the
//   prices shown and traded at are the snapshot from the last tick.
// * Confiscated cargo is auctioned back into the legal market at the
//   port of seizure.
// * Flagged players are visibly marked, but only after repeat
//   confiscations, only while flagged, and they are told.

export const TERRASPACE_MAX_SECTOR = 10;

export const CONTRABAND_COMMODITIES = [
  'banned_tech',
  'restricted_meds',
  'stolen_artifacts',
] as const;
export type ContrabandCommodity = (typeof CONTRABAND_COMMODITIES)[number];

export const STASH_HOLD_LIMIT = 25; // units of contraband per derelict
export const FLAG_CONFISCATION_THRESHOLD = 2; // repeat offenders only
export const FLAG_DURATION_HOURS = 48;
export const REP_PER_CONFISCATION = 2;
export const FINE_RATE = 0.5; // of the seized cargo's base value
export const AUCTION_PRICE_RATE = 0.7; // of base price
export const AUCTION_DURATION_HOURS = 24;
export const AUCTION_TNN_THRESHOLD = 5000; // credits of seized value worth a TNN mention
export const SCAN_COOLDOWN_MINUTES = 15;
export const MAX_OPEN_MARKETS = 1; // per universe, to start
export const MARKET_OPEN_CHANCE = 0.08; // per universe per tick
export const MARKET_EARLY_CLOSE_CHANCE = 0.03; // per tick after the minimum run
export const MARKET_MIN_HOURS = 2;
export const MARKET_MAX_HOURS = 6;
export const PATROL_TTL_MINUTES = 45;
export const PATROL_MOVE_CHANCE = 0.5; // per patrol per tick
export const DEFAULT_PATROL_COUNT = 4;

// Ship stealth: a multiplier on scan chance. Small, fast hulls are
// hard to read; big haulers are flying billboards. There is no stealth
// stat on ship_types yet, so the rating lives here keyed by hull name.
export const STEALTH_MULTIPLIERS: Record<string, number> = {
  escape_pod: 0.5,
  scout: 0.6,
  scout_marauder: 0.55,
  trader: 0.9,
  freighter: 1.1,
  merchant_cruiser: 1.0,
  missile_frigate: 0.9,
  havoc_gunstar: 1.1,
  tholian_sentinel: 1.2,
  interdictor_cruiser: 1.3,
  corporate_flagship: 1.4,
};

export const getStealthMultiplier = (shipType: string | null | undefined): number => {
  if (!shipType) return 1.0;
  return STEALTH_MULTIPLIERS[shipType.toLowerCase()] ?? 1.0;
};

export interface ScanChanceInput {
  contrabandUnits: number;
  totalHoldUnits: number;
  stealthMultiplier: number;
  flagged: boolean;
  stormCover: boolean;
  incursionDistraction: boolean;
  settingsMultiplier: number;
}

/**
 * The scan math, kept pure so it can be tested without a database.
 * No contraband means no scan ever fires. A hold full of contraband
 * in a billboard hull is the worst case; a storm overhead is the
 * smuggler's best friend. Bounded so a scan stings but rarely ruins.
 */
export const computeScanChance = (input: ScanChanceInput): number => {
  if (input.contrabandUnits <= 0) return 0;
  const fraction = input.contrabandUnits / Math.max(1, input.totalHoldUnits);
  let chance = 0.12 + 0.5 * fraction;
  chance *= input.stealthMultiplier;
  if (input.flagged) chance *= 1.5;
  if (input.stormCover) chance *= 0.35;
  if (input.incursionDistraction) chance *= 0.6;
  chance *= input.settingsMultiplier;
  return Math.max(0.02, Math.min(0.85, chance));
};

export const isFlaggedRow = (player: { flagged_until?: string | null }): boolean =>
  !!player.flagged_until && new Date(player.flagged_until).getTime() > Date.now();

export interface ContrabandGood {
  commodity: ContrabandCommodity;
  displayName: string;
  basePrice: number;
  homeSectors: Array<[number, number]>;
  demandSectors: Array<[number, number]>;
}

const toGood = (row: any): ContrabandGood => ({
  commodity: row.commodity,
  displayName: row.display_name,
  basePrice: row.base_price,
  homeSectors: Array.isArray(row.home_sectors) ? row.home_sectors : [],
  demandSectors: Array.isArray(row.demand_sectors) ? row.demand_sectors : [],
});

export const getContrabandCatalog = async (): Promise<ContrabandGood[]> => {
  const result = await query(`SELECT * FROM contraband_goods ORDER BY base_price`);
  return result.rows.map(toGood);
};

const inRanges = (sector: number, ranges: Array<[number, number]>): boolean =>
  ranges.some(([min, max]) => sector >= min && sector <= max);

/**
 * Regional price factors. Home region: cheap to buy, poor to sell.
 * Demand region: dear to buy, pays a fortune. Elsewhere: middling.
 */
export const regionalFactors = (
  good: ContrabandGood,
  sectorNumber: number
): { buy: number; sell: number } => {
  if (inRanges(sectorNumber, good.homeSectors)) return { buy: 0.55, sell: 0.75 };
  if (inRanges(sectorNumber, good.demandSectors)) return { buy: 1.5, sell: 2.3 };
  return { buy: 1.0, sell: 1.25 };
};

/**
 * Snapshot prices for one good at one market. The premium (a port
 * strike demand shock) lands mostly on the sell side: the black
 * market pays over the odds for what the legal market cannot move.
 */
export const computeSnapshotPrice = (
  good: ContrabandGood,
  sectorNumber: number,
  drift: number,
  premium: number
): { buy: number; sell: number } => {
  const factors = regionalFactors(good, sectorNumber);
  const driftMultiplier = 1 + Math.max(-0.4, Math.min(0.4, drift));
  const buyPremium = 1 + (premium - 1) / 2;
  return {
    buy: Math.max(1, Math.round(good.basePrice * factors.buy * driftMultiplier * buyPremium)),
    sell: Math.max(1, Math.round(good.basePrice * factors.sell * driftMultiplier * premium)),
  };
};

const cargoColumn = (commodity: ContrabandCommodity): string => `cargo_${commodity}`;

// The player summary shape the port panels already consume.
const playerSummary = (player: any): any => ({
  credits: parseInt(player.credits, 10) || 0,
  cargoFuel: player.cargo_fuel || 0,
  cargoOrganics: player.cargo_organics || 0,
  cargoEquipment: player.cargo_equipment || 0,
  turnsRemaining: player.turns_remaining,
  shipHoldsMax: player.ship_holds_max,
});

export const contrabandUnits = (player: any): number =>
  CONTRABAND_COMMODITIES.reduce((sum, c) => sum + (player[cargoColumn(c)] || 0), 0);

export const totalHoldUnits = (player: any): number =>
  (player.cargo_fuel || 0) +
  (player.cargo_organics || 0) +
  (player.cargo_equipment || 0) +
  contrabandUnits(player);

const logEvent = async (
  client: any,
  universeId: number,
  playerId: number | null,
  eventType: string,
  sectorNumber: number | null,
  details: Record<string, unknown>
): Promise<void> => {
  await client.query(
    `INSERT INTO smuggling_log (universe_id, player_id, event_type, sector_number, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [universeId, playerId, eventType, sectorNumber, JSON.stringify(details)]
  );
};

const getSettings = async (
  client: any,
  universeId: number
): Promise<{ scanChanceMultiplier: number; patrolCount: number }> => {
  const result = await client.query(
    `SELECT scan_chance_multiplier, patrol_count FROM smuggling_settings WHERE universe_id = $1`,
    [universeId]
  );
  if (result.rows.length === 0) {
    return { scanChanceMultiplier: 1, patrolCount: DEFAULT_PATROL_COUNT };
  }
  return {
    scanChanceMultiplier: parseFloat(result.rows[0].scan_chance_multiplier) || 1,
    patrolCount: result.rows[0].patrol_count ?? DEFAULT_PATROL_COUNT,
  };
};

/**
 * A player's own smuggling picture: contraband in the hold (the cargo
 * scanner view), reputation, and whether they are flagged right now.
 */
export const getPlayerStatus = async (userId: number): Promise<any> => {
  const result = await pool.query(
    `SELECT id, universe_id, current_sector, ship_type, ship_holds_max,
            cargo_fuel, cargo_organics, cargo_equipment,
            cargo_banned_tech, cargo_restricted_meds, cargo_stolen_artifacts,
            contraband_rep, flagged_until
     FROM players WHERE user_id = $1`,
    [userId]
  );
  if (result.rows.length === 0) throw new Error('Player not found');
  const player = result.rows[0];
  const cargo: Record<string, number> = {};
  for (const c of CONTRABAND_COMMODITIES) cargo[c] = player[cargoColumn(c)] || 0;
  return {
    playerId: player.id,
    universeId: player.universe_id,
    currentSector: player.current_sector,
    cargo,
    contrabandUnits: contrabandUnits(player),
    holdUsed: totalHoldUnits(player),
    holdMax: player.ship_holds_max,
    reputation: player.contraband_rep || 0,
    flagged: isFlaggedRow(player),
    flaggedUntil: player.flagged_until,
  };
};

/**
 * Market board: every port in the universe with its black market
 * state and last tick prices. Visible before arrival, by design;
 * the prices are the stale snapshot, labelled with when they were set.
 */
export const getMarketBoard = async (userId: number): Promise<any[]> => {
  const playerResult = await pool.query(
    'SELECT universe_id FROM players WHERE user_id = $1',
    [userId]
  );
  if (playerResult.rows.length === 0) throw new Error('Player not found');
  const universeId = playerResult.rows[0].universe_id;

  const result = await pool.query(
    `SELECT s.sector_number, s.name AS port_name, s.port_type,
            bm.is_open, bm.closes_at, bm.premium_multiplier, bm.prices, bm.prices_as_of,
            (SELECT COUNT(*) FROM contraband_auctions ca
              WHERE ca.universe_id = s.universe_id AND ca.sector_number = s.sector_number
                AND ca.expires_at > NOW()) AS auction_lots
     FROM sectors s
     LEFT JOIN black_markets bm
       ON bm.universe_id = s.universe_id AND bm.sector_number = s.sector_number
     WHERE s.universe_id = $1 AND s.port_type IS NOT NULL AND s.port_type != 'STARDOCK'
     ORDER BY s.sector_number`,
    [universeId]
  );

  return result.rows.map((row) => ({
    sectorNumber: row.sector_number,
    portName: row.port_name || `Sector ${row.sector_number}`,
    portType: row.port_type,
    marketOpen: !!row.is_open,
    closesAt: row.closes_at,
    premiumMultiplier: row.premium_multiplier ? parseFloat(row.premium_multiplier) : 1,
    prices: row.prices || {},
    pricesAsOf: row.prices_as_of,
    auctionLots: parseInt(row.auction_lots, 10) || 0,
  }));
};

/**
 * Auction lots at one port: confiscated cargo being sold back into
 * the legal market. Anyone docked there can buy; the goods are still
 * contraband once they are in a hold.
 */
export const getAuctionsAtSector = async (
  universeId: number,
  sectorNumber: number
): Promise<any[]> => {
  const result = await pool.query(
    `SELECT ca.id, ca.commodity, cg.display_name, ca.quantity, ca.unit_price, ca.expires_at
     FROM contraband_auctions ca
     JOIN contraband_goods cg ON cg.commodity = ca.commodity
     WHERE ca.universe_id = $1 AND ca.sector_number = $2 AND ca.expires_at > NOW()
     ORDER BY ca.created_at`,
    [universeId, sectorNumber]
  );
  return result.rows.map((row) => ({
    id: row.id,
    commodity: row.commodity,
    displayName: row.display_name,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    expiresAt: row.expires_at,
  }));
};

/**
 * Trade contraband at the black market in the player's current
 * sector. Requires the explicit confirm step (the opt in), an open
 * market, and executes at the stale snapshot prices.
 */
export const tradeContraband = async (
  userId: number,
  commodity: ContrabandCommodity,
  action: 'buy' | 'sell',
  quantity: number,
  confirm: boolean
): Promise<any> => {
  if (!CONTRABAND_COMMODITIES.includes(commodity)) {
    throw new Error('Unknown contraband commodity');
  }
  if (!confirm) {
    throw new Error('Contraband trades need the confirm step. Nothing about this is an accident.');
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('Quantity must be a positive whole number');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const playerResult = await client.query(
      `SELECT * FROM players WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    if (playerResult.rows.length === 0) throw new Error('Player not found');
    const player = playerResult.rows[0];

    if (player.turns_remaining <= 0) throw new Error('Not enough turns remaining');

    const marketResult = await client.query(
      `SELECT * FROM black_markets
       WHERE universe_id = $1 AND sector_number = $2 FOR UPDATE`,
      [player.universe_id, player.current_sector]
    );
    if (marketResult.rows.length === 0 || !marketResult.rows[0].is_open) {
      throw new Error('No open black market at this port');
    }
    const market = marketResult.rows[0];
    const snapshot = (market.prices || {})[commodity];
    if (!snapshot) throw new Error('This market is not quoting that good right now');

    const column = cargoColumn(commodity);
    const held = player[column] || 0;
    let actual = quantity;
    let total: number;

    if (action === 'buy') {
      const freeSpace = player.ship_holds_max - totalHoldUnits(player);
      actual = Math.min(actual, freeSpace);
      total = actual * snapshot.buy;
      if (total > player.credits) {
        actual = Math.floor(player.credits / snapshot.buy);
        total = actual * snapshot.buy;
      }
      if (actual <= 0) {
        throw new Error('Cannot complete trade: insufficient credits or cargo space');
      }
      await client.query(
        `UPDATE players SET ${column} = ${column} + $1, credits = credits - $2,
           turns_remaining = turns_remaining - 1 WHERE id = $3`,
        [actual, total, player.id]
      );
    } else {
      actual = Math.min(actual, held);
      if (actual <= 0) throw new Error('You do not have any of that to sell');
      total = actual * snapshot.sell;
      await client.query(
        `UPDATE players SET ${column} = ${column} - $1, credits = credits + $2,
           turns_remaining = turns_remaining - 1,
           contraband_rep = GREATEST(0, contraband_rep - 1)
         WHERE id = $3`,
        [actual, total, player.id]
      );
    }

    // The trade nudges next tick's prices through drift; the snapshot
    // itself does not move until the tick, which is the whole point
    // of stale pricing.
    const drift = { ...(market.drift || {}) };
    const current = typeof drift[commodity] === 'number' ? drift[commodity] : 0;
    const delta = action === 'buy' ? 0.002 * actual : -0.002 * actual;
    drift[commodity] = Math.max(-0.4, Math.min(0.4, current + delta));
    await client.query(
      `UPDATE black_markets SET drift = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(drift), market.id]
    );

    await logEvent(client, player.universe_id, player.id, 'trade', player.current_sector, {
      commodity,
      action,
      quantity: actual,
      pricePerUnit: action === 'buy' ? snapshot.buy : snapshot.sell,
      total,
    });

    const updatedResult = await client.query(`SELECT * FROM players WHERE id = $1`, [player.id]);

    await client.query('COMMIT');

    return {
      success: true,
      commodity,
      action,
      quantity: actual,
      totalCost: total,
      pricesAsOf: market.prices_as_of,
      player: playerSummary(updatedResult.rows[0]),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Buy a customs auction lot at the player's current port.
 */
export const buyAuction = async (
  userId: number,
  auctionId: number,
  quantity: number,
  confirm: boolean
): Promise<any> => {
  if (!confirm) {
    throw new Error('Auction purchases need the confirm step. The goods are still contraband once they are in your hold.');
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('Quantity must be a positive whole number');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const playerResult = await client.query(
      `SELECT * FROM players WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    if (playerResult.rows.length === 0) throw new Error('Player not found');
    const player = playerResult.rows[0];

    if (player.turns_remaining <= 0) throw new Error('Not enough turns remaining');

    const lotResult = await client.query(
      `SELECT * FROM contraband_auctions
       WHERE id = $1 AND universe_id = $2 AND sector_number = $3 AND expires_at > NOW()
       FOR UPDATE`,
      [auctionId, player.universe_id, player.current_sector]
    );
    if (lotResult.rows.length === 0) {
      throw new Error('That auction lot is not available at this port');
    }
    const lot = lotResult.rows[0];

    let actual = Math.min(quantity, lot.quantity);
    const freeSpace = player.ship_holds_max - totalHoldUnits(player);
    actual = Math.min(actual, freeSpace);
    let total = actual * lot.unit_price;
    if (total > player.credits) {
      actual = Math.floor(player.credits / lot.unit_price);
      total = actual * lot.unit_price;
    }
    if (actual <= 0) {
      throw new Error('Cannot complete purchase: insufficient credits or cargo space');
    }

    const column = cargoColumn(lot.commodity as ContrabandCommodity);
    await client.query(
      `UPDATE players SET ${column} = ${column} + $1, credits = credits - $2,
         turns_remaining = turns_remaining - 1 WHERE id = $3`,
      [actual, total, player.id]
    );

    if (actual >= lot.quantity) {
      await client.query(`DELETE FROM contraband_auctions WHERE id = $1`, [lot.id]);
    } else {
      await client.query(
        `UPDATE contraband_auctions SET quantity = quantity - $1 WHERE id = $2`,
        [actual, lot.id]
      );
    }

    await logEvent(client, player.universe_id, player.id, 'auction_buy', player.current_sector, {
      commodity: lot.commodity,
      quantity: actual,
      unitPrice: lot.unit_price,
      total,
    });

    const updatedResult = await client.query(`SELECT * FROM players WHERE id = $1`, [player.id]);

    await client.query('COMMIT');
    return {
      success: true,
      commodity: lot.commodity,
      quantity: actual,
      totalCost: total,
      player: playerSummary(updatedResult.rows[0]),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * The nearest trading port to a sector (by sector number distance),
 * where confiscated cargo gets auctioned. Stardock is excluded: the
 * auction belongs in the trading world, not the safe zone.
 */
export const findAuctionPort = async (
  client: any,
  universeId: number,
  sectorNumber: number
): Promise<number | null> => {
  const result = await client.query(
    `SELECT sector_number FROM sectors
     WHERE universe_id = $1 AND port_type IS NOT NULL AND port_type != 'STARDOCK'
     ORDER BY ABS(sector_number - $2), sector_number
     LIMIT 1`,
    [universeId, sectorNumber]
  );
  return result.rows.length > 0 ? result.rows[0].sector_number : null;
};

/**
 * Confiscation: seize all contraband, fine half its base value
 * (never more than the player carries in credits), take the
 * reputation hit, auction the goods at the port of seizure, and
 * flag repeat offenders. The ship, its legal cargo, fighters and
 * shields are never touched.
 */
export const confiscateCargo = async (
  client: any,
  player: any,
  sectorNumber: number
): Promise<{ units: number; value: number; fine: number; flagged: boolean }> => {
  const catalog = await getContrabandCatalog();
  const priceByCommodity = new Map(catalog.map((g) => [g.commodity, g.basePrice]));

  let units = 0;
  let value = 0;
  const seized: Array<{ commodity: ContrabandCommodity; quantity: number }> = [];
  for (const commodity of CONTRABAND_COMMODITIES) {
    const qty = player[cargoColumn(commodity)] || 0;
    if (qty > 0) {
      seized.push({ commodity, quantity: qty });
      units += qty;
      value += qty * (priceByCommodity.get(commodity) || 0);
    }
  }

  const fine = Math.min(parseInt(player.credits, 10) || 0, Math.ceil(value * FINE_RATE));
  const wasFlagged = isFlaggedRow(player);

  await client.query(
    `UPDATE players SET
       cargo_banned_tech = 0, cargo_restricted_meds = 0, cargo_stolen_artifacts = 0,
       credits = credits - $1,
       contraband_rep = contraband_rep + $2
     WHERE id = $3`,
    [fine, REP_PER_CONFISCATION, player.id]
  );

  await logEvent(client, player.universe_id, player.id, 'confiscation', sectorNumber, {
    units,
    value,
    fine,
    seized,
  });

  // Auction the seized goods back into the legal market.
  const auctionSector = await findAuctionPort(client, player.universe_id, sectorNumber);
  if (auctionSector !== null) {
    for (const lot of seized) {
      const unitPrice = Math.max(
        1,
        Math.round((priceByCommodity.get(lot.commodity) || 0) * AUCTION_PRICE_RATE)
      );
      await client.query(
        `INSERT INTO contraband_auctions
           (universe_id, sector_number, commodity, quantity, unit_price, seized_from, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7 || ' hours')::INTERVAL)`,
        [
          player.universe_id,
          auctionSector,
          lot.commodity,
          lot.quantity,
          unitPrice,
          player.id,
          String(AUCTION_DURATION_HOURS),
        ]
      );
    }
    await logEvent(client, player.universe_id, player.id, 'auction_created', auctionSector, {
      seizedAtSector: sectorNumber,
      units,
      value,
    });
    if (value >= AUCTION_TNN_THRESHOLD) {
      try {
        await broadcastTNN(
          player.universe_id,
          'Customs Auction',
          `TNN Port Authority: seized contraband worth ${value.toLocaleString()} credits goes under the hammer at the port in Sector ${auctionSector}. Legal buyers welcome. The previous owner was not available for comment.`
        );
      } catch {
        // Broadcast is best effort; the auction still stands.
      }
    }
  }

  // Flagging: repeat confiscations only, for a fixed window, and
  // the player is told. A single bad scan never marks anyone.
  const countResult = await client.query(
    `SELECT COUNT(*) AS count FROM smuggling_log
     WHERE player_id = $1 AND event_type = 'confiscation'`,
    [player.id]
  );
  const confiscations = parseInt(countResult.rows[0].count, 10);
  let flagged = false;
  if (confiscations >= FLAG_CONFISCATION_THRESHOLD) {
    await client.query(
      `UPDATE players SET flagged_until = NOW() + ($1 || ' hours')::INTERVAL WHERE id = $2`,
      [String(FLAG_DURATION_HOURS), player.id]
    );
    flagged = true;
    if (!wasFlagged) {
      await logEvent(client, player.universe_id, player.id, 'flagged', sectorNumber, {
        confiscations,
        hours: FLAG_DURATION_HOURS,
      });
      await client.query(
        `INSERT INTO messages (universe_id, sender_id, recipient_id, sender_name, subject, body, message_type)
         VALUES ($1, NULL, $2, 'Customs Patrol', 'You have been flagged',
                 'Port Authority notice: repeated confiscations have put your ship on the customs watch list. Other pilots can see your flagged status while it lasts, and patrol scans read you more easily. It expires on its own; clean runs clear your name faster.', 'DIRECT')`,
        [player.universe_id, player.id]
      );
      try {
        emitPlayerEvent(player.id, 'smuggling_flagged', {
          flaggedUntilHours: FLAG_DURATION_HOURS,
          sectorNumber,
        });
      } catch {
        // Best effort; the message in the inbox is the durable notice.
      }
    }
  }

  return { units, value, fine, flagged };
};

/**
 * Cover check for a sector: an active ion storm overhead, or an
 * active incursion in this or an adjacent sector thinning patrols.
 */
export const getCoverForSector = async (
  universeId: number,
  sectorNumber: number
): Promise<{ stormCover: boolean; incursionDistraction: boolean }> => {
  let stormCover = false;
  let incursionDistraction = false;
  try {
    const events = await getLiveEvents(universeId);
    for (const event of events) {
      if (event.state !== 'active') continue;
      if (event.type === 'ion_storm' && event.regionSectors.includes(sectorNumber)) {
        stormCover = true;
      }
      if (
        event.type === 'incursion' &&
        event.regionSectors.some((s) => Math.abs(s - sectorNumber) <= 1)
      ) {
        incursionDistraction = true;
      }
    }
  } catch {
    // Events are an enhancement; scans resolve without cover data.
  }
  return { stormCover, incursionDistraction };
};

/**
 * Resolve one patrol scan against one player. Exported for tests;
 * the tick calls it for every patrol and carrier pair. A clean scan
 * is a non event beyond a log line for tuning.
 */
export const scanPlayer = async (
  playerId: number,
  rng: () => number = Math.random
): Promise<{ scanned: boolean; confiscated: boolean; chance: number }> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const playerResult = await client.query(
      `SELECT * FROM players WHERE id = $1 FOR UPDATE`,
      [playerId]
    );
    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { scanned: false, confiscated: false, chance: 0 };
    }
    const player = playerResult.rows[0];
    const sectorNumber = player.current_sector;

    // Fairness: patrols never operate in TerraSpace, and a scan only
    // fires on a hold that actually carries contraband.
    if (sectorNumber <= TERRASPACE_MAX_SECTOR || contrabandUnits(player) <= 0) {
      await client.query('ROLLBACK');
      return { scanned: false, confiscated: false, chance: 0 };
    }

    const settings = await getSettings(client, player.universe_id);
    const cover = await getCoverForSector(player.universe_id, sectorNumber);
    const chance = computeScanChance({
      contrabandUnits: contrabandUnits(player),
      totalHoldUnits: totalHoldUnits(player),
      stealthMultiplier: getStealthMultiplier(player.ship_type),
      flagged: isFlaggedRow(player),
      stormCover: cover.stormCover,
      incursionDistraction: cover.incursionDistraction,
      settingsMultiplier: settings.scanChanceMultiplier,
    });

    if (rng() >= chance) {
      await logEvent(client, player.universe_id, player.id, 'scan_clean', sectorNumber, {
        chance: Math.round(chance * 1000) / 1000,
        cover,
      });
      await client.query('COMMIT');
      return { scanned: true, confiscated: false, chance };
    }

    await confiscateCargo(client, player, sectorNumber);
    await client.query('COMMIT');
    return { scanned: true, confiscated: true, chance };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Stash info for the derelict in the player's current sector: what
 * is cached there and whether this player cleared it (only the crew
 * that cleared a wreck may stock its stash). Other crews see that a
 * stash exists and what is in it, never whose it is.
 */
export const getSectorStashInfo = async (userId: number): Promise<any> => {
  const playerResult = await pool.query(
    'SELECT id, universe_id, current_sector FROM players WHERE user_id = $1',
    [userId]
  );
  if (playerResult.rows.length === 0) throw new Error('Player not found');
  const player = playerResult.rows[0];

  const derelictResult = await pool.query(
    `SELECT * FROM derelicts
     WHERE universe_id = $1 AND sector_number = $2 AND expires_at > NOW()
     LIMIT 1`,
    [player.universe_id, player.current_sector]
  );
  if (derelictResult.rows.length === 0) {
    return { derelict: null, stashes: [], canStash: false, stashLimit: STASH_HOLD_LIMIT };
  }
  const derelict = derelictResult.rows[0];

  const stashResult = await pool.query(
    `SELECT ds.id, ds.commodity, cg.display_name, ds.quantity, ds.player_id
     FROM derelict_stashes ds
     JOIN contraband_goods cg ON cg.commodity = ds.commodity
     WHERE ds.derelict_id = $1
     ORDER BY ds.id`,
    [derelict.id]
  );

  return {
    derelict: {
      id: derelict.id,
      type: derelict.type,
      state: derelict.state,
      sectorNumber: derelict.sector_number,
      expiresAt: derelict.expires_at,
      clearedByYou: derelict.claimed_by === player.id,
    },
    stashes: stashResult.rows.map((row) => ({
      id: row.id,
      commodity: row.commodity,
      displayName: row.display_name,
      quantity: row.quantity,
      mine: row.player_id === player.id,
    })),
    canStash: derelict.state === 'claimed' && derelict.claimed_by === player.id,
    stashLimit: STASH_HOLD_LIMIT,
  };
};

/**
 * Cache contraband in a derelict this player has already cleared.
 * The stash rides the derelict's expiry window and is invisible to
 * patrol scans, because it is not in the hold.
 */
export const stashCargo = async (
  playerId: number,
  derelictId: number,
  commodity: ContrabandCommodity,
  quantity: number
): Promise<{ success: boolean; message: string }> => {
  if (!CONTRABAND_COMMODITIES.includes(commodity)) {
    return { success: false, message: 'Unknown contraband commodity' };
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { success: false, message: 'Quantity must be a positive whole number' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const playerResult = await client.query(
      `SELECT * FROM players WHERE id = $1 FOR UPDATE`,
      [playerId]
    );
    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found' };
    }
    const player = playerResult.rows[0];

    const derelictResult = await client.query(
      `SELECT * FROM derelicts WHERE id = $1 FOR UPDATE`,
      [derelictId]
    );
    if (derelictResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Derelict not found' };
    }
    const derelict = derelictResult.rows[0];

    if (derelict.sector_number !== player.current_sector) {
      await client.query('ROLLBACK');
      return { success: false, message: 'You are not at that derelict' };
    }
    if (derelict.state !== 'claimed' || derelict.claimed_by !== playerId) {
      await client.query('ROLLBACK');
      return { success: false, message: 'You can only stash in a derelict you have cleared yourself' };
    }
    if (new Date(derelict.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return { success: false, message: 'That derelict has broken up. The stash window is gone' };
    }

    const column = cargoColumn(commodity);
    if ((player[column] || 0) < quantity) {
      await client.query('ROLLBACK');
      return { success: false, message: 'You do not have that much in your hold' };
    }

    const totalResult = await client.query(
      `SELECT COALESCE(SUM(quantity), 0) AS total FROM derelict_stashes WHERE derelict_id = $1`,
      [derelictId]
    );
    const stashedTotal = parseInt(totalResult.rows[0].total, 10);
    if (stashedTotal + quantity > STASH_HOLD_LIMIT) {
      await client.query('ROLLBACK');
      return {
        success: false,
        message: `That wreck can hide ${STASH_HOLD_LIMIT} units at most (${stashedTotal} already cached)`,
      };
    }

    await client.query(
      `UPDATE players SET ${column} = ${column} - $1 WHERE id = $2`,
      [quantity, playerId]
    );
    await client.query(
      `INSERT INTO derelict_stashes (derelict_id, universe_id, sector_number, player_id, commodity, quantity)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (derelict_id, player_id, commodity)
       DO UPDATE SET quantity = derelict_stashes.quantity + EXCLUDED.quantity, updated_at = NOW()`,
      [derelictId, player.universe_id, derelict.sector_number, playerId, commodity, quantity]
    );
    await logEvent(client, player.universe_id, playerId, 'stash_deposit', derelict.sector_number, {
      commodity,
      quantity,
      derelictId,
    });

    await client.query('COMMIT');
    return { success: true, message: `Cached ${quantity} units in the wreck. No manifest, no questions.` };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Take contraband out of a derelict stash: your own cache, or
 * somebody else's, if you found it first. Looting another crew's
 * stash feeds the TNN rumor mill (approximate location, no names).
 */
export const retrieveStash = async (
  playerId: number,
  stashId: number
): Promise<{ success: boolean; message: string; taken: number }> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const playerResult = await client.query(
      `SELECT * FROM players WHERE id = $1 FOR UPDATE`,
      [playerId]
    );
    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found', taken: 0 };
    }
    const player = playerResult.rows[0];

    const stashResult = await client.query(
      `SELECT * FROM derelict_stashes WHERE id = $1 FOR UPDATE`,
      [stashId]
    );
    if (stashResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'No stash there', taken: 0 };
    }
    const stash = stashResult.rows[0];

    if (stash.sector_number !== player.current_sector) {
      await client.query('ROLLBACK');
      return { success: false, message: 'You are not at that derelict', taken: 0 };
    }

    const freeSpace = player.ship_holds_max - totalHoldUnits(player);
    const taken = Math.min(stash.quantity, Math.max(0, freeSpace));
    if (taken <= 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Your hold is full', taken: 0 };
    }

    const column = cargoColumn(stash.commodity as ContrabandCommodity);
    await client.query(
      `UPDATE players SET ${column} = ${column} + $1 WHERE id = $2`,
      [taken, playerId]
    );
    if (taken >= stash.quantity) {
      await client.query(`DELETE FROM derelict_stashes WHERE id = $1`, [stashId]);
    } else {
      await client.query(
        `UPDATE derelict_stashes SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
        [taken, stashId]
      );
    }

    const looted = stash.player_id !== playerId;
    if (looted) {
      await logEvent(client, player.universe_id, playerId, 'stash_loot', stash.sector_number, {
        commodity: stash.commodity,
        quantity: taken,
        derelictId: stash.derelict_id,
      });
    }

    await client.query('COMMIT');

    if (looted) {
      try {
        const jitter = Math.floor(Math.random() * 11) - 5;
        const rumorSector = Math.max(11, stash.sector_number + jitter);
        await broadcastTNN(
          player.universe_id,
          'Stash Heist',
          `TNN Rumor Mill: someone's stash got cleaned out of a wreck near Sector ${rumorSector}. The owner has not come forward. Wonder why.`
        );
      } catch {
        // Best effort; the loot is already aboard.
      }
      return { success: true, message: `Found a cache: ${taken} units, now in your hold. Finders keepers.`, taken };
    }
    return { success: true, message: `Recovered ${taken} units from your cache.`, taken };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// ---------------------------------------------------------------------------
// The tick: markets flip, prices snapshot, patrols sweep and scan,
// reputation decays. Runs on the 5 minute cadence from the entry point.
// ---------------------------------------------------------------------------

const pickPatrolSector = async (client: any, universeId: number): Promise<number | null> => {
  // Weighted toward trade routes and the TerraSpace border: ports and
  // traffic draw patrols, and sectors 11 to 40 sit on the border.
  // TerraSpace itself (1 to 10) is never patrolled.
  const result = await client.query(
    `SELECT s.sector_number,
            1
            + CASE WHEN s.port_type IS NOT NULL THEN 3 ELSE 0 END
            + CASE WHEN s.sector_number <= 40 THEN 1 ELSE 0 END
            + 2 * (SELECT COUNT(*) FROM players p
                    WHERE p.universe_id = s.universe_id
                      AND p.current_sector = s.sector_number AND p.is_alive)
              AS weight
     FROM sectors s
     WHERE s.universe_id = $1 AND s.sector_number > $2`,
    [universeId, TERRASPACE_MAX_SECTOR]
  );
  if (result.rows.length === 0) return null;
  const totalWeight = result.rows.reduce((sum: number, r: any) => sum + Number(r.weight), 0);
  let roll = Math.random() * totalWeight;
  for (const row of result.rows) {
    roll -= Number(row.weight);
    if (roll <= 0) return row.sector_number;
  }
  return result.rows[result.rows.length - 1].sector_number;
};

const refreshMarketPrices = async (
  client: any,
  catalog: ContrabandGood[],
  market: any
): Promise<void> => {
  // A strike at this port is a demand shock: the black market pays a
  // premium while the legal market cannot move goods.
  const strike = await getStrikeForSector(market.universe_id, market.sector_number);
  let premium = parseFloat(market.premium_multiplier) || 1;
  if (strike) {
    premium = 1.75;
  } else if (premium >= 1.75) {
    premium = 1.15;
  }

  const drift = market.drift || {};
  const prices: Record<string, { buy: number; sell: number }> = {};
  for (const good of catalog) {
    prices[good.commodity] = computeSnapshotPrice(
      good,
      market.sector_number,
      typeof drift[good.commodity] === 'number' ? drift[good.commodity] : 0,
      premium
    );
  }

  await client.query(
    `UPDATE black_markets
     SET prices = $1, premium_multiplier = $2, prices_as_of = NOW(), updated_at = NOW()
     WHERE id = $3`,
    [JSON.stringify(prices), premium, market.id]
  );
};

const flipMarkets = async (client: any, catalog: ContrabandGood[]): Promise<void> => {
  const universes = await client.query(`SELECT id FROM universes`);
  for (const universe of universes.rows) {
    const universeId = universe.id;

    // Close markets that ran their course, plus the occasional early
    // shuttering: the classic smuggler's heartbreak.
    const openResult = await client.query(
      `SELECT bm.*, s.name AS port_name FROM black_markets bm
       JOIN sectors s ON s.id = bm.port_id
       WHERE bm.universe_id = $1 AND bm.is_open`,
      [universeId]
    );
    let openCount = 0;
    for (const market of openResult.rows) {
      const expired = market.closes_at && new Date(market.closes_at).getTime() <= Date.now();
      const ranLongEnough =
        market.opened_at &&
        Date.now() - new Date(market.opened_at).getTime() > MARKET_MIN_HOURS * 3600 * 1000;
      if (expired || (ranLongEnough && Math.random() < MARKET_EARLY_CLOSE_CHANCE)) {
        await client.query(
          `UPDATE black_markets SET is_open = FALSE, updated_at = NOW() WHERE id = $1`,
          [market.id]
        );
        await logEvent(client, universeId, null, 'market_close', market.sector_number, {
          portName: market.port_name,
        });
        try {
          await broadcastTNN(
            universeId,
            'Market Closed',
            `TNN Underworld: the black market at ${market.port_name || `Sector ${market.sector_number}`} has gone dark. Suppliers vanished overnight. Legitimate trade resumes its usual boredom.`
          );
        } catch {
          // Best effort.
        }
      } else {
        openCount++;
        await refreshMarketPrices(client, catalog, market);
      }
    }

    // Open a new market when the universe has room and the dice say so.
    if (openCount < MAX_OPEN_MARKETS && Math.random() < MARKET_OPEN_CHANCE) {
      const portResult = await client.query(
        `SELECT s.id, s.sector_number, s.name FROM sectors s
         WHERE s.universe_id = $1 AND s.port_type IS NOT NULL AND s.port_type != 'STARDOCK'
           AND s.sector_number > $2
           AND NOT EXISTS (
             SELECT 1 FROM black_markets bm
             WHERE bm.universe_id = s.universe_id AND bm.sector_number = s.sector_number AND bm.is_open
           )
         ORDER BY RANDOM() LIMIT 1`,
        [universeId, TERRASPACE_MAX_SECTOR]
      );
      if (portResult.rows.length > 0) {
        const port = portResult.rows[0];
        const hours = MARKET_MIN_HOURS + Math.random() * (MARKET_MAX_HOURS - MARKET_MIN_HOURS);
        const premium = Math.round((1 + Math.random() * 0.3) * 100) / 100;
        const inserted = await client.query(
          `INSERT INTO black_markets
             (universe_id, sector_number, port_id, is_open, opened_at, closes_at, premium_multiplier)
           VALUES ($1, $2, $3, TRUE, NOW(), NOW() + ($4 || ' hours')::INTERVAL, $5)
           ON CONFLICT (universe_id, sector_number)
           DO UPDATE SET is_open = TRUE, opened_at = NOW(),
             closes_at = NOW() + ($4 || ' hours')::INTERVAL,
             premium_multiplier = $5, updated_at = NOW()
           RETURNING *`,
          [universeId, port.sector_number, port.id, String(hours), premium]
        );
        await refreshMarketPrices(client, catalog, inserted.rows[0]);
        await logEvent(client, universeId, null, 'market_open', port.sector_number, {
          portName: port.name,
          hours: Math.round(hours * 10) / 10,
        });
        try {
          await broadcastTNN(
            universeId,
            'Black Market Open',
            `TNN Underworld: a black market has opened at ${port.name || `Sector ${port.sector_number}`}. Buyers and sellers advised that discretion is a virtue.`
          );
        } catch {
          // Best effort.
        }
      }
    }
  }
};

const sweepPatrols = async (client: any): Promise<void> => {
  await client.query(`DELETE FROM patrols WHERE expires_at <= NOW()`);

  const universes = await client.query(`SELECT id FROM universes`);
  for (const universe of universes.rows) {
    const universeId = universe.id;
    const settings = await getSettings(client, universeId);

    // Patrols drift: standing still is how smugglers learn your route.
    const patrolsResult = await client.query(
      `SELECT * FROM patrols WHERE universe_id = $1`,
      [universeId]
    );
    for (const patrol of patrolsResult.rows) {
      if (Math.random() < PATROL_MOVE_CHANCE) {
        const next = await pickPatrolSector(client, universeId);
        if (next !== null && next !== patrol.sector_number) {
          await client.query(`UPDATE patrols SET sector_number = $1 WHERE id = $2`, [
            next,
            patrol.id,
          ]);
          patrol.sector_number = next;
        }
      }
    }

    // Top the sweep up to the configured strength.
    let count = patrolsResult.rows.length;
    while (count < settings.patrolCount) {
      const sector = await pickPatrolSector(client, universeId);
      if (sector === null) break;
      await client.query(
        `INSERT INTO patrols (universe_id, sector_number, expires_at)
         VALUES ($1, $2, NOW() + ($3 || ' minutes')::INTERVAL)`,
        [universeId, sector, String(PATROL_TTL_MINUTES)]
      );
      count++;
    }

    // Announce fresh sweeps now and then, public safety bulletin style.
    if (patrolsResult.rows.length > 0 && Math.random() < 0.25) {
      const patrol = patrolsResult.rows[Math.floor(Math.random() * patrolsResult.rows.length)];
      try {
        await broadcastTNN(
          universeId,
          'Customs Sweep',
          `TNN Port Authority: customs sweep in progress near Sector ${patrol.sector_number}. Law abiding pilots have nothing to fear.`
        );
      } catch {
        // Best effort.
      }
    }
  }
};

const runScans = async (): Promise<void> => {
  const patrolsResult = await query(`SELECT * FROM patrols WHERE expires_at > NOW()`);
  for (const patrol of patrolsResult.rows) {
    const playersResult = await query(
      `SELECT p.id FROM players p
       WHERE p.universe_id = $1 AND p.current_sector = $2 AND p.is_alive
         AND (p.cargo_banned_tech > 0 OR p.cargo_restricted_meds > 0 OR p.cargo_stolen_artifacts > 0)
         AND NOT EXISTS (
           SELECT 1 FROM smuggling_log sl
           WHERE sl.player_id = p.id AND sl.event_type IN ('scan_clean', 'confiscation')
             AND sl.created_at > NOW() - ($3 || ' minutes')::INTERVAL
         )`,
      [patrol.universe_id, patrol.sector_number, String(SCAN_COOLDOWN_MINUTES)]
    );
    for (const row of playersResult.rows) {
      try {
        await scanPlayer(row.id);
      } catch (error) {
        console.error('[Smuggling] Scan error:', error);
      }
    }
  }
};

const decayReputation = async (client: any): Promise<void> => {
  // Reputation fades for pilots who have not been caught lately.
  // Nobody is marked forever.
  await client.query(
    `UPDATE players p SET contraband_rep = contraband_rep - 1
     WHERE p.contraband_rep > 0
       AND NOT EXISTS (
         SELECT 1 FROM smuggling_log sl
         WHERE sl.player_id = p.id AND sl.event_type = 'confiscation'
           AND sl.created_at > NOW() - INTERVAL '24 hours'
       )`
  );
};

/**
 * Run one smuggling tick across all universes.
 */
export const runSmugglingTick = async (): Promise<void> => {
  const catalog = await getContrabandCatalog();
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM contraband_auctions WHERE expires_at <= NOW()`);
    await flipMarkets(client, catalog);
    await sweepPatrols(client);
    await decayReputation(client);
  } finally {
    client.release();
  }
  // Scans run outside the tick transaction: each scan locks its own
  // player row and commits on its own, like boarding a derelict.
  await runScans();
};

/**
 * Start the smuggling tick on an interval. Follows the
 * startEconomyTick pattern.
 */
export const startSmugglingTick = (intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout => {
  console.log('[Smuggling] Starting smuggling tick every 5 minutes');

  runSmugglingTick().catch((error) => {
    console.error('[Smuggling] Tick error:', error);
  });

  return setInterval(() => {
    runSmugglingTick().catch((error) => {
      console.error('[Smuggling] Tick error:', error);
    });
  }, intervalMs);
};

// ---------------------------------------------------------------------------
// Admin: patrol panel data and controls.
// ---------------------------------------------------------------------------

export const adminListPatrols = async (universeId?: number): Promise<any[]> => {
  const result = universeId
    ? await query(
        `SELECT * FROM patrols WHERE universe_id = $1 ORDER BY sector_number`,
        [universeId]
      )
    : await query(`SELECT * FROM patrols ORDER BY universe_id, sector_number`);
  return result.rows.map((row) => ({
    id: row.id,
    universeId: row.universe_id,
    sectorNumber: row.sector_number,
    spawnedAt: row.spawned_at,
    expiresAt: row.expires_at,
  }));
};

export const adminSpawnPatrol = async (
  universeId: number,
  sectorNumber?: number
): Promise<any> => {
  const client = await pool.connect();
  try {
    let sector = sectorNumber;
    if (sector === undefined || sector === null) {
      sector = (await pickPatrolSector(client, universeId)) ?? undefined;
      if (sector === undefined) throw new Error('No legal sector for a patrol in that universe');
    }
    if (sector <= TERRASPACE_MAX_SECTOR) {
      throw new Error('Patrols never operate in TerraSpace (sectors 1 to 10)');
    }
    const result = await client.query(
      `INSERT INTO patrols (universe_id, sector_number, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' minutes')::INTERVAL)
       RETURNING *`,
      [universeId, sector, String(PATROL_TTL_MINUTES)]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
};

export const adminClearPatrols = async (universeId: number): Promise<number> => {
  const result = await query(`DELETE FROM patrols WHERE universe_id = $1`, [universeId]);
  return result.rowCount || 0;
};

export const adminGetSettings = async (
  universeId: number
): Promise<{ scanChanceMultiplier: number; patrolCount: number }> => {
  const client = await pool.connect();
  try {
    return await getSettings(client, universeId);
  } finally {
    client.release();
  }
};

export const adminUpdateSettings = async (
  universeId: number,
  updates: { scanChanceMultiplier?: number; patrolCount?: number }
): Promise<{ scanChanceMultiplier: number; patrolCount: number }> => {
  const current = await adminGetSettings(universeId);
  const scanChanceMultiplier =
    updates.scanChanceMultiplier !== undefined
      ? Math.max(0, Math.min(10, updates.scanChanceMultiplier))
      : current.scanChanceMultiplier;
  const patrolCount =
    updates.patrolCount !== undefined
      ? Math.max(0, Math.min(50, Math.floor(updates.patrolCount)))
      : current.patrolCount;
  await query(
    `INSERT INTO smuggling_settings (universe_id, scan_chance_multiplier, patrol_count, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (universe_id)
     DO UPDATE SET scan_chance_multiplier = $2, patrol_count = $3, updated_at = NOW()`,
    [universeId, scanChanceMultiplier, patrolCount]
  );
  return { scanChanceMultiplier, patrolCount };
};

export const adminGetLog = async (universeId?: number, limit = 50): Promise<any[]> => {
  const result = universeId
    ? await query(
        `SELECT * FROM smuggling_log WHERE universe_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [universeId, limit]
      )
    : await query(`SELECT * FROM smuggling_log ORDER BY created_at DESC LIMIT $1`, [limit]);
  return result.rows.map((row) => ({
    id: row.id,
    universeId: row.universe_id,
    playerId: row.player_id,
    eventType: row.event_type,
    sectorNumber: row.sector_number,
    details: row.details || {},
    createdAt: row.created_at,
  }));
};
