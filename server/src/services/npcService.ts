import { pool, query } from '../db/connection';
import { findPath } from './pathfindingService';
import { PORT_TYPES, BASE_PRICES } from './portService';

// NPC traffic tick: a fixed pool of named trader ships per universe
// warps between ports and trades small amounts, so port stock and
// prices move through the same economy logic player trades use, even
// with zero humans online. NPCs are persistent, visible in sector
// traffic, and answer hails with market tips. They are never
// destroyed and cannot be attacked or robbed in v1.

export interface NpcShip {
  id: number;
  universeId: number;
  name: string;
  shipName: string;
  shipType: string;
  currentSector: number;
  destinationSector: number | null;
}

interface NpcRosterEntry {
  name: string;
  shipName: string;
  shipType: string;
  holdsMax: number;
}

const NPC_ROSTER: NpcRosterEntry[] = [
  { name: 'Mara Voss', shipName: 'Rustbucket Gospel', shipType: 'freighter', holdsMax: 100 },
  { name: "Old Man Ferreira", shipName: 'Patience', shipType: 'trader', holdsMax: 50 },
  { name: 'Captain Ilya Sorren', shipName: 'Ledger of Sorrows', shipType: 'merchant_cruiser', holdsMax: 75 },
  { name: 'The Widow Anaya', shipName: 'Black Lace', shipType: 'trader', holdsMax: 50 },
  { name: 'Brother Cadmus', shipName: 'Tithe Runner', shipType: 'freighter', holdsMax: 100 },
  { name: 'Juno Park', shipName: 'Lucky Streak', shipType: 'scout', holdsMax: 20 },
  { name: 'Silas Grange', shipName: "Grange's Folly", shipType: 'freighter', holdsMax: 100 },
  { name: 'Mother Okonkwo', shipName: 'Full Belly', shipType: 'merchant_cruiser', holdsMax: 75 },
];

const HOPS_PER_TICK = 2;
const TRADE_MIN_QTY = 3;
const TRADE_MAX_QTY = 10;

const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const toNpcShip = (row: any): NpcShip => ({
  id: row.id,
  universeId: row.universe_id,
  name: row.name,
  shipName: row.ship_name,
  shipType: row.ship_type,
  currentSector: row.current_sector,
  destinationSector: row.destination_sector,
});

/**
 * NPC ships currently in a sector, for sector displays.
 * Returns an empty list when the npc_ships table does not exist yet.
 */
export const getNpcShipsInSector = async (
  universeId: number,
  sectorNumber: number
): Promise<NpcShip[]> => {
  try {
    const result = await query(
      `SELECT * FROM npc_ships
       WHERE universe_id = $1 AND current_sector = $2
       ORDER BY name`,
      [universeId, sectorNumber]
    );
    return result.rows.map(toNpcShip);
  } catch {
    return [];
  }
};

/**
 * Create any missing roster NPCs for a universe, parked at random
 * ports. Runs inside the tick, so new universes populate themselves.
 */
const ensureNpcPool = async (client: any, universeId: number): Promise<void> => {
  const existing = await client.query(
    `SELECT name FROM npc_ships WHERE universe_id = $1`,
    [universeId]
  );
  const present = new Set(existing.rows.map((r: any) => r.name));
  const missing = NPC_ROSTER.filter((entry) => !present.has(entry.name));
  if (missing.length === 0) return;

  const ports = await client.query(
    `SELECT sector_number FROM sectors
     WHERE universe_id = $1 AND port_type IS NOT NULL
     ORDER BY RANDOM()`,
    [universeId]
  );
  if (ports.rows.length === 0) return;

  for (let i = 0; i < missing.length; i++) {
    const entry = missing[i];
    const startSector = ports.rows[i % ports.rows.length].sector_number;
    await client.query(
      `INSERT INTO npc_ships
         (universe_id, name, ship_name, ship_type, current_sector, holds_max, credits)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (universe_id, name) DO NOTHING`,
      [universeId, entry.name, entry.shipName, entry.shipType, startSector, entry.holdsMax, 10000]
    );
  }
};

/**
 * Trade at the port in the NPC's current sector, following the
 * port's own buy and sell configuration. Moves real stock on the
 * sectors row and records volume and drift in port_economy, exactly
 * like a player trade, so the living economy feels NPC traffic.
 */
const tradeAtCurrentPort = async (client: any, npc: any): Promise<void> => {
  const sectorRes = await client.query(
    `SELECT id, port_type, port_fuel_qty, port_organics_qty, port_equipment_qty
     FROM sectors WHERE universe_id = $1 AND sector_number = $2`,
    [npc.universe_id, npc.current_sector]
  );
  if (sectorRes.rows.length === 0) return;
  const sector = sectorRes.rows[0];
  if (!sector.port_type || sector.port_type === 'STARDOCK') return;

  const config = PORT_TYPES[sector.port_type];
  if (!config) return;

  // A strike shuts the port for everyone, NPCs included.
  try {
    const strikeRes = await client.query(
      `SELECT 1 FROM dynamic_events
       WHERE universe_id = $1 AND type = 'port_strike' AND state = 'active'
         AND region_sectors @> $2::jsonb
       LIMIT 1`,
      [npc.universe_id, JSON.stringify([npc.current_sector])]
    );
    if (strikeRes.rows.length > 0) return;
  } catch {
    // Dynamic events table may not exist yet; trade normally.
  }

  const cargo: Record<string, number> = {
    fuel: npc.cargo_fuel,
    organics: npc.cargo_organics,
    equipment: npc.cargo_equipment,
  };
  const portQty: Record<string, number> = {
    fuel: sector.port_fuel_qty || 0,
    organics: sector.port_organics_qty || 0,
    equipment: sector.port_equipment_qty || 0,
  };
  let credits: number = npc.credits;
  let holdsUsed = cargo.fuel + cargo.organics + cargo.equipment;

  for (const commodity of ['fuel', 'organics', 'equipment'] as const) {
    const basePrice = BASE_PRICES[commodity];
    if (config[commodity] === 'S' && portQty[commodity] > 0) {
      // The port sells, the NPC buys (cheap, at the sell side price).
      const price = Math.max(1, Math.round(basePrice * 0.5));
      const wanted = randInt(TRADE_MIN_QTY, TRADE_MAX_QTY);
      const qty = Math.min(
        wanted,
        portQty[commodity],
        npc.holds_max - holdsUsed,
        Math.floor(credits / price)
      );
      if (qty > 0) {
        cargo[commodity] += qty;
        holdsUsed += qty;
        credits -= qty * price;
        await client.query(
          `UPDATE sectors SET port_${commodity}_qty = port_${commodity}_qty - $1 WHERE id = $2`,
          [qty, sector.id]
        );
        await recordNpcTradeVolume(client, npc.universe_id, npc.current_sector, commodity, 'buy', qty);
      }
    } else if (config[commodity] === 'B' && cargo[commodity] > 0) {
      // The port buys, the NPC sells (at the buy side price).
      const price = Math.round(basePrice * 1.7);
      const qty = Math.min(cargo[commodity], randInt(TRADE_MIN_QTY, TRADE_MAX_QTY));
      if (qty > 0) {
        cargo[commodity] -= qty;
        holdsUsed -= qty;
        credits += qty * price;
        await client.query(
          `UPDATE sectors SET port_${commodity}_qty = port_${commodity}_qty + $1 WHERE id = $2`,
          [qty, sector.id]
        );
        await recordNpcTradeVolume(client, npc.universe_id, npc.current_sector, commodity, 'sell', qty);
      }
    }
  }

  await client.query(
    `UPDATE npc_ships
     SET cargo_fuel = $1, cargo_organics = $2, cargo_equipment = $3, credits = $4, updated_at = NOW()
     WHERE id = $5`,
    [cargo.fuel, cargo.organics, cargo.equipment, credits, npc.id]
  );
};

const recordNpcTradeVolume = async (
  client: any,
  universeId: number,
  sectorNumber: number,
  commodity: string,
  action: 'buy' | 'sell',
  quantity: number
): Promise<void> => {
  const volumeColumn = action === 'buy' ? 'volume_bought' : 'volume_sold';
  const driftDelta = action === 'buy' ? 0.002 * quantity : -0.002 * quantity;
  await client.query(
    `INSERT INTO port_economy (universe_id, sector_number, commodity, ${volumeColumn}, drift, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (universe_id, sector_number, commodity)
     DO UPDATE SET
       ${volumeColumn} = port_economy.${volumeColumn} + EXCLUDED.${volumeColumn},
       drift = GREATEST(-0.4, LEAST(0.4, port_economy.drift + EXCLUDED.drift)),
       updated_at = NOW()`,
    [universeId, sectorNumber, commodity, quantity, driftDelta]
  );
};

/**
 * Move one NPC: plan a route when it has none, walk up to
 * HOPS_PER_TICK hops, then trade if it ended at a port.
 */
const moveNpc = async (client: any, npc: any): Promise<void> => {
  let route: number[] = Array.isArray(npc.route) ? [...npc.route] : [];
  let destination: number | null = npc.destination_sector;
  let current: number = npc.current_sector;

  if (route.length === 0) {
    const destRes = await client.query(
      `SELECT sector_number FROM sectors
       WHERE universe_id = $1 AND port_type IS NOT NULL AND sector_number != $2
       ORDER BY RANDOM() LIMIT 1`,
      [npc.universe_id, current]
    );
    if (destRes.rows.length === 0) return;
    const targetSector: number = destRes.rows[0].sector_number;
    destination = targetSector;
    const path = await findPath(current, targetSector, npc.universe_id);
    if (!path || path.length < 2) {
      destination = null;
    } else {
      route = path.slice(1);
    }
  }

  let hops = 0;
  while (route.length > 0 && hops < HOPS_PER_TICK) {
    current = route.shift()!;
    hops++;
  }
  if (route.length === 0) {
    destination = null;
  }

  if (current !== npc.current_sector || hops > 0) {
    await client.query(
      `UPDATE npc_ships
       SET current_sector = $1, route = $2, destination_sector = $3, updated_at = NOW()
       WHERE id = $4`,
      [current, JSON.stringify(route), destination, npc.id]
    );
  } else if (destination !== npc.destination_sector) {
    await client.query(
      `UPDATE npc_ships SET route = $1, destination_sector = $2, updated_at = NOW() WHERE id = $3`,
      [JSON.stringify(route), destination, npc.id]
    );
  }

  const updatedRes = await client.query(`SELECT * FROM npc_ships WHERE id = $1`, [npc.id]);
  if (updatedRes.rows.length > 0) {
    await tradeAtCurrentPort(client, updatedRes.rows[0]);
  }
};

/**
 * Hail an NPC in the player's sector. The NPC answers with a market
 * tip drawn from live drift data in the player's universe.
 */
export const hailNpc = async (
  playerId: number,
  npcId: number
): Promise<{ success: boolean; message: string; npcName?: string; shipName?: string }> => {
  const playerRes = await query(
    `SELECT universe_id, current_sector FROM players WHERE id = $1`,
    [playerId]
  );
  if (playerRes.rows.length === 0) {
    return { success: false, message: 'Player not found' };
  }
  const player = playerRes.rows[0];

  const npcRes = await query(
    `SELECT * FROM npc_ships WHERE id = $1 AND universe_id = $2`,
    [npcId, player.universe_id]
  );
  if (npcRes.rows.length === 0) {
    return { success: false, message: 'No trader by that name in this universe' };
  }
  const npc = npcRes.rows[0];

  if (npc.current_sector !== player.current_sector) {
    return {
      success: false,
      message: `${npc.name} is not in this sector. Long range hails go unanswered out here.`,
    };
  }

  const marketRes = await query(
    `SELECT pe.sector_number, pe.commodity, pe.drift, pe.event_state
     FROM port_economy pe
     WHERE pe.universe_id = $1
     ORDER BY ABS(pe.drift) DESC
     LIMIT 12`,
    [player.universe_id]
  );

  const greetings = [
    `${npc.name} of the ${npc.ship_name} answers on a crackle of static.`,
    `The ${npc.ship_name} lights up your comm. ${npc.name} sounds like they have time to talk.`,
    `${npc.name} answers the hail with the ease of someone who trades gossip like cargo.`,
  ];
  const greeting = greetings[randInt(0, greetings.length - 1)];

  let tip: string;
  const hot = marketRes.rows.find((r: any) => parseFloat(r.drift) > 0.05 || r.event_state === 'scarcity');
  const cold = marketRes.rows.find((r: any) => parseFloat(r.drift) < -0.05 || r.event_state === 'surplus');
  if (hot && (!cold || Math.random() < 0.5)) {
    tip = `"Word is the port in Sector ${hot.sector_number} is paying over the odds for ${hot.commodity}. Shelves are thin and prices are running hot. Get there before everyone else hears it."`;
  } else if (cold) {
    tip = `"Sector ${cold.sector_number} is long on ${cold.commodity} and practically giving it away. Fill your holds there, sell it somewhere with a pulse."`;
  } else {
    tip = `"Markets are quiet, friend. Quiet never lasts. Keep your holds half empty and your tanks full, and you will be ready when it breaks."`;
  }

  return {
    success: true,
    npcName: npc.name,
    shipName: npc.ship_name,
    message: `${greeting} ${tip}`,
  };
};

/**
 * Run one NPC traffic tick across all universes.
 */
export const runNpcTick = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    const universes = await client.query(`SELECT id FROM universes`);
    for (const universe of universes.rows) {
      try {
        await ensureNpcPool(client, universe.id);
        const npcs = await client.query(
          `SELECT * FROM npc_ships WHERE universe_id = $1 ORDER BY id`,
          [universe.id]
        );
        for (const npc of npcs.rows) {
          try {
            await moveNpc(client, npc);
          } catch (error) {
            console.error(`[NPC] Error moving NPC ${npc.id}:`, error);
          }
        }
      } catch (error) {
        console.error('[NPC] Tick error for universe:', error);
      }
    }
  } finally {
    client.release();
  }
};

/**
 * Start the NPC traffic tick on an interval. Follows the
 * maintenanceService pattern.
 */
export const startNpcTick = (intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout => {
  console.log('[NPC] Starting NPC traffic tick every 5 minutes');

  runNpcTick().catch((error) => {
    console.error('[NPC] Tick error:', error);
  });

  return setInterval(() => {
    runNpcTick().catch((error) => {
      console.error('[NPC] Tick error:', error);
    });
  }, intervalMs);
};
