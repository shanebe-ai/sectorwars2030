import { pool, query } from '../db/connection';
import { broadcastTNN } from './broadcastService';
import { resolveCombatRounds } from './combatService';
import { spawnEventDerelicts } from './derelictService';

// Dynamic event tick: seed new events, advance brewing events to
// active, apply resolution effects, and announce everything through
// TNN. Runs on an interval from the server entry point, following the
// startEconomyTick pattern.
//
// Fairness rules from the spec, enforced here:
// - At most MAX_CONCURRENT_EVENTS brewing or active per universe.
// - Nothing ever targets TerraSpace (sectors 1 to 10).
// - Warnings always precede effects: every event brews first.
// - Events never destroy a player's ship, cargo, or credits outright.

export type DynamicEventType = 'ion_storm' | 'incursion' | 'port_strike' | 'trade_boom' | 'salvage_field' | 'contract' | 'pirate_flotilla';
export type DynamicEventState = 'brewing' | 'active' | 'resolved';
export type StormEffect = 'none' | 'extra_turn' | 'misfire' | 'fail';

export interface DynamicEvent {
  id: number;
  universeId: number;
  type: DynamicEventType;
  state: DynamicEventState;
  regionSectors: number[];
  targetPortId: number | null;
  brewingEndsAt: string;
  activeEndsAt: string | null;
  params: Record<string, any>;
  createdAt: string;
  resolvedAt: string | null;
}

const MAX_CONCURRENT_EVENTS = 2;
const TERRASPACE_MAX_SECTOR = 10;
const BREWING_MINUTES = 30;
const SEED_CHANCE = 0.05; // 5% chance per universe per tick
const SEED_COOLDOWN_MINUTES = 30; // minimum gap between seeded events
const SPREAD_EXTEND_HOURS = 2;
export const INCURSION_TRADE_PENALTY = 0.25; // prices 25% worse under an incursion
const STRIKE_DEMAND_DRIFT = 0.15; // drift bump at neighbouring ports during a strike
const STRIKE_SURGE_MINUTES = 60; // post strike price dip duration
const STORM_SALVAGE_CHANCE = 0.25;
export const TRADE_BOOM_BONUS = 0.3; // ports in a boom pay 30% more for the commodity
export const PRICE_DRIFT_BOUND = 0.4; // same bound portService applies to drift
const TRADE_BOOM_MIN_SECTORS = 8;
const TRADE_BOOM_MAX_SECTORS = 15;
const SALVAGE_FIELD_MIN_SECTORS = 4;
const SALVAGE_FIELD_MAX_SECTORS = 8;
const SALVAGE_FIELD_MIN_DERELICTS = 5;
const SALVAGE_FIELD_MAX_DERELICTS = 8;
// TerraCorp contract terms. The goal is sized from the game's actual
// cargo holds: starter ships carry 20, working freighters 125 to 250,
// and the biggest liners 500, so 500 units is two to four full hauler
// loads. A small crew can meet it inside one active window, and it is
// far beyond a solo starter ship errand.
export const CONTRACT_GOAL_UNITS = 500;
const CONTRACT_BASE_POOL = 50000;
const CONTRACT_POOL_RATE = 0.05; // pool also pays 5% of the goal's market value
const CONTRACT_MISS_RATE = 0.5; // a missed goal still pays out at half rate
// Mirrors BASE_PRICES in portService; kept in step by hand so the pool
// math uses the same market values the ports trade at.
const COMMODITY_BASE_PRICES: Record<string, number> = { fuel: 20, organics: 35, equipment: 55 };
const COMMODITIES = ['fuel', 'organics', 'equipment'] as const;
// Pirate flotilla shape. A flotilla works a small linked region with
// a handful of ships: most stop traders and charge a toll, a few are
// raiders who shoot on sight. The kill bonus scales with the pirate's
// spawn fighters, so a raider is worth hunting and a toll skiff is
// not worth farming at flat rates.
const FLOTILLA_MIN_REGION = 3;
const FLOTILLA_MAX_REGION = 5;
const FLOTILLA_MIN_SHIPS = 3;
const FLOTILLA_MAX_SHIPS = 6;
const FLOTILLA_RAIDER_CHANCE = 0.15;
const FLOTILLA_TOLL_FIGHTERS: [number, number] = [30, 50];
const FLOTILLA_TOLL_SHIELDS: [number, number] = [100, 200];
const FLOTILLA_TOLL_CREDITS: [number, number] = [3000, 8000];
const FLOTILLA_RAIDER_FIGHTERS: [number, number] = [80, 120];
const FLOTILLA_RAIDER_SHIELDS: [number, number] = [250, 400];
const FLOTILLA_RAIDER_CREDITS: [number, number] = [8000, 15000];
export const FLOTILLA_BOUNTY_BASE = 5000;
export const FLOTILLA_BOUNTY_PER_FIGHTER = 100;
const PIRATE_TOLL_NAMES = [
  'Widow Nine', 'Sister Mercy', 'Copper Jack', 'The Auditor',
  'Polite Pete', 'Madame Ledger', 'Brother Toll', 'Quiet Annie',
  'The Tollkeeper', 'Cousin Rake', 'Miss Ten Percent', 'Honest Ilya',
];
const PIRATE_RAIDER_NAMES = [
  'Glass Hammer', 'Red Wedding', 'The Undertaker', 'Sister Slaughter',
  'Cannonball Kate', 'The Widowmaker', 'Bloody Pavel', 'Iron Confession',
];

const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const EVENT_TYPES: DynamicEventType[] = ['ion_storm', 'incursion', 'port_strike', 'trade_boom', 'salvage_field', 'contract', 'pirate_flotilla'];

const toEvent = (row: any): DynamicEvent => ({
  id: row.id,
  universeId: row.universe_id,
  type: row.type,
  state: row.state,
  regionSectors: Array.isArray(row.region_sectors) ? row.region_sectors : [],
  targetPortId: row.target_port_id,
  brewingEndsAt: row.brewing_ends_at,
  activeEndsAt: row.active_ends_at,
  params: row.params || {},
  createdAt: row.created_at,
  resolvedAt: row.resolved_at,
});

/**
 * Roll the effect of a warp that touches an active ion storm.
 * Weighted fair, never a trap: most jumps get through clean, the
 * worst outcome is a failed jump that costs the turn.
 */
export const rollStormEffect = (rng: () => number = Math.random): StormEffect => {
  const roll = rng();
  if (roll < 0.1) return 'fail';
  if (roll < 0.25) return 'misfire';
  if (roll < 0.45) return 'extra_turn';
  return 'none';
};

/**
 * Active ion storm covering a move between two sectors, if any.
 * Returns null when the dynamic_events table does not exist yet.
 */
export const getStormForMove = async (
  universeId: number,
  fromSector: number,
  toSector: number
): Promise<DynamicEvent | null> => {
  try {
    const result = await query(
      `SELECT * FROM dynamic_events
       WHERE universe_id = $1 AND type = 'ion_storm' AND state = 'active'
         AND (region_sectors @> $2::jsonb OR region_sectors @> $3::jsonb)
       LIMIT 1`,
      [universeId, JSON.stringify([fromSector]), JSON.stringify([toSector])]
    );
    return result.rows.length > 0 ? toEvent(result.rows[0]) : null;
  } catch {
    return null;
  }
};

/**
 * The active port strike covering a sector's port, if any.
 */
export const getStrikeForSector = async (
  universeId: number,
  sectorNumber: number
): Promise<DynamicEvent | null> => {
  try {
    const result = await query(
      `SELECT * FROM dynamic_events
       WHERE universe_id = $1 AND type = 'port_strike' AND state = 'active'
         AND region_sectors @> $2::jsonb
       LIMIT 1`,
      [universeId, JSON.stringify([sectorNumber])]
    );
    return result.rows.length > 0 ? toEvent(result.rows[0]) : null;
  } catch {
    return null;
  }
};

/**
 * Trade penalty fraction for a sector under an active incursion
 * (0.25 means prices are 25% worse for players). 0 when clear.
 */
export const getIncursionPenalty = async (
  universeId: number,
  sectorNumber: number
): Promise<number> => {
  try {
    const result = await query(
      `SELECT 1 FROM dynamic_events
       WHERE universe_id = $1 AND type = 'incursion' AND state = 'active'
         AND region_sectors @> $2::jsonb
       LIMIT 1`,
      [universeId, JSON.stringify([sectorNumber])]
    );
    return result.rows.length > 0 ? INCURSION_TRADE_PENALTY : 0;
  } catch {
    return 0;
  }
};

/**
 * Trade boom bonus for a commodity at a sector's port (0.3 means the
 * port pays 30% more). 0 when no boom is active there. Brewing booms
 * return 0: warnings always precede effects.
 */
export const getTradeBoomBonus = async (
  universeId: number,
  sectorNumber: number,
  commodity: string
): Promise<number> => {
  try {
    const result = await query(
      `SELECT params FROM dynamic_events
       WHERE universe_id = $1 AND type = 'trade_boom' AND state = 'active'
         AND region_sectors @> $2::jsonb
         AND params->>'commodity' = $3
       LIMIT 1`,
      [universeId, JSON.stringify([sectorNumber]), commodity]
    );
    if (result.rows.length === 0) return 0;
    const bonus = Number(result.rows[0].params?.bonus);
    return Number.isFinite(bonus) ? bonus : TRADE_BOOM_BONUS;
  } catch {
    return 0;
  }
};

/**
 * Effective drift once a trade boom is layered on top. The combined
 * change never leaves the [-0.4, 0.4] drift bound, and a port already
 * in a scarcity or surplus state is skipped by the boom.
 */
export const applyTradeBoom = (drift: number, eventState: string | null | undefined, bonus: number): number => {
  const skipped = eventState === 'scarcity' || eventState === 'surplus';
  const combined = skipped ? drift : drift + bonus;
  return Math.max(-PRICE_DRIFT_BOUND, Math.min(PRICE_DRIFT_BOUND, combined));
};

/**
 * Build a boom region by walking warps out from a seed sector,
 * breadth first, never entering TerraSpace.
 */
const walkBoomRegion = async (
  client: any,
  universeId: number,
  seed: number,
  target: number
): Promise<number[]> => {
  const region: number[] = [seed];
  const seen = new Set<number>([seed]);
  const queue: number[] = [seed];
  while (queue.length > 0 && region.length < target) {
    const current = queue.shift() as number;
    const neighbours = await getAdjacentSectors(client, universeId, current);
    for (const n of neighbours) {
      if (region.length >= target) break;
      if (seen.has(n)) continue;
      seen.add(n);
      if (n <= TERRASPACE_MAX_SECTOR) continue;
      region.push(n);
      queue.push(n);
    }
  }
  return region;
};

export interface FlotillaShipPlan {
  sector: number;
  isRaider: boolean;
  fighters: number;
  shields: number;
  credits: number;
  cargoFuel: number;
  cargoOrganics: number;
  cargoEquipment: number;
  shipName: string;
}

/**
 * Plan a flotilla's ships against a region: how many ships, where
 * they sit, which of them are raiders, and what each one carries.
 * Pure apart from the dice, so tests can pin the shape. The plan is
 * fixed at creation because the TNN forecast has to name the raider
 * sectors before a single pirate row exists; the rows themselves
 * only spawn when the event goes active.
 */
export const buildFlotillaPlan = (regionSectors: number[]): FlotillaShipPlan[] => {
  const shipCount = randInt(FLOTILLA_MIN_SHIPS, FLOTILLA_MAX_SHIPS);
  const tollNames = [...PIRATE_TOLL_NAMES].sort(() => Math.random() - 0.5);
  const raiderNames = [...PIRATE_RAIDER_NAMES].sort(() => Math.random() - 0.5);
  let tollNameIdx = 0;
  let raiderNameIdx = 0;

  const rollStats = (isRaider: boolean) => ({
    fighters: isRaider
      ? randInt(FLOTILLA_RAIDER_FIGHTERS[0], FLOTILLA_RAIDER_FIGHTERS[1])
      : randInt(FLOTILLA_TOLL_FIGHTERS[0], FLOTILLA_TOLL_FIGHTERS[1]),
    shields: isRaider
      ? randInt(FLOTILLA_RAIDER_SHIELDS[0], FLOTILLA_RAIDER_SHIELDS[1])
      : randInt(FLOTILLA_TOLL_SHIELDS[0], FLOTILLA_TOLL_SHIELDS[1]),
    credits: isRaider
      ? randInt(FLOTILLA_RAIDER_CREDITS[0], FLOTILLA_RAIDER_CREDITS[1])
      : randInt(FLOTILLA_TOLL_CREDITS[0], FLOTILLA_TOLL_CREDITS[1]),
  });

  const plan: FlotillaShipPlan[] = [];
  for (let i = 0; i < shipCount; i++) {
    const cargoTotal = randInt(10, 30);
    const cargoFuel = randInt(0, cargoTotal);
    const cargoOrganics = randInt(0, cargoTotal - cargoFuel);
    const isRaider = Math.random() < FLOTILLA_RAIDER_CHANCE;
    plan.push({
      sector: regionSectors[i % regionSectors.length],
      isRaider,
      ...rollStats(isRaider),
      cargoFuel,
      cargoOrganics,
      cargoEquipment: cargoTotal - cargoFuel - cargoOrganics,
      shipName: '',
    });
  }

  // A big flotilla always has teeth: if no raider rolled, the
  // strongest toll ship converts, and its stats re-roll in the
  // raider ranges so its bounty matches the risk it now poses.
  if (shipCount >= 5 && !plan.some((p) => p.isRaider)) {
    let strongest = 0;
    for (let i = 1; i < plan.length; i++) {
      if (plan[i].fighters > plan[strongest].fighters) strongest = i;
    }
    plan[strongest].isRaider = true;
    Object.assign(plan[strongest], rollStats(true));
  }

  for (const ship of plan) {
    ship.shipName = ship.isRaider
      ? raiderNames[raiderNameIdx++ % raiderNames.length]
      : tollNames[tollNameIdx++ % tollNames.length];
  }

  return plan;
};

const commodityLabel = (commodity: string | undefined): string => {
  if (commodity === 'fuel') return 'Fuel Ore';
  if (commodity === 'organics') return 'Organics';
  if (commodity === 'equipment') return 'Equipment';
  return 'cargo';
};

const sectorList = (sectors: number[]): string => sectors.join(', ');

/**
 * Events currently brewing or active in a universe.
 */
export const getLiveEvents = async (universeId: number): Promise<DynamicEvent[]> => {
  const result = await query(
    `SELECT * FROM dynamic_events
     WHERE universe_id = $1 AND state IN ('brewing', 'active')
     ORDER BY created_at ASC`,
    [universeId]
  );
  return result.rows.map(toEvent);
};

/**
 * Live events touching a specific sector (for sector displays).
 */
export const getEventsForSector = async (
  universeId: number,
  sectorNumber: number
): Promise<DynamicEvent[]> => {
  try {
    const result = await query(
      `SELECT * FROM dynamic_events
       WHERE universe_id = $1 AND state IN ('brewing', 'active')
         AND region_sectors @> $2::jsonb
       ORDER BY created_at ASC`,
      [universeId, JSON.stringify([sectorNumber])]
    );
    return result.rows.map(toEvent);
  } catch {
    return [];
  }
};

/**
 * Warp neighbours of a sector (bidirectional, same lookup the sector
 * details endpoint uses). Exported for other services that need true
 * warp adjacency (smuggling cover) instead of sector number math.
 */
export const getAdjacentSectors = async (
  client: any,
  universeId: number,
  sectorNumber: number
): Promise<number[]> => {
  const sectorRes = await client.query(
    `SELECT id FROM sectors WHERE universe_id = $1 AND sector_number = $2`,
    [universeId, sectorNumber]
  );
  if (sectorRes.rows.length === 0) return [];
  const sectorId = sectorRes.rows[0].id;

  const warpsRes = await client.query(
    `SELECT DISTINCT
       CASE
         WHEN sw.sector_id = $1 THEN sw.destination_sector_number
         ELSE (SELECT sector_number FROM sectors WHERE id = sw.sector_id)
       END as destination
     FROM sector_warps sw
     JOIN sectors s ON sw.sector_id = s.id
     WHERE s.universe_id = $2 AND (sw.sector_id = $1 OR sw.destination_sector_number = $3)`,
    [sectorId, universeId, sectorNumber]
  );
  return warpsRes.rows
    .map((r: any) => r.destination as number)
    .filter((n: number) => typeof n === 'number' && n !== sectorNumber);
};

const tnnForecast = (event: DynamicEvent, sectorName: string | null): { subject: string; body: string } => {
  const firstSector = event.regionSectors[0];
  switch (event.type) {
    case 'ion_storm':
      return {
        subject: 'TNN Weather Desk: Ion Storm Building',
        body: `TNN Weather Desk: ion activity building in the drift near Sector ${firstSector}. Pilots advised to reroute or ride it out. Storm window opens in ${BREWING_MINUTES} minutes.`,
      };
    case 'incursion':
      return {
        subject: 'TNN Flash: Alien Movement Detected',
        body: `TNN Flash: long range sensors show an alien force massing near Sector ${firstSector}. An incursion is expected within the hour. Defenses requested. Salvage rights to whoever clears it.`,
      };
    case 'port_strike':
      return {
        subject: 'TNN Labor Wire: Strike Vote Called',
        body: `TNN Labor Wire: dockworkers at ${sectorName ? `the port in Sector ${firstSector}` : `Sector ${firstSector}`} have voted to walk out. Trade there stops when the strike begins. Nearby ports are already reporting strong demand.`,
      };
    case 'trade_boom': {
      const minutes = Math.max(
        1,
        Math.round((new Date(event.brewingEndsAt).getTime() - new Date(event.createdAt).getTime()) / 60000)
      );
      const label = commodityLabel(event.params.commodity);
      return {
        subject: `TNN Market Watch: ${label} Boom Coming`,
        body: `TNN Market Watch: buyers are lining up for ${label} around Sector ${firstSector}. Starting in ${minutes} minute${minutes === 1 ? '' : 's'}, ports in sectors ${sectorList(event.regionSectors)} will pay up to 30% more for it. Fill your holds now.`,
      };
    }
    case 'salvage_field': {
      const minutes = Math.max(
        1,
        Math.round((new Date(event.brewingEndsAt).getTime() - new Date(event.createdAt).getTime()) / 60000)
      );
      return {
        subject: 'TNN Salvage Desk: Debris Field Forming',
        body: `TNN Salvage Desk: long range scans show a fresh debris field condensing around Sector ${firstSector}, across sectors ${sectorList(event.regionSectors)}. When it settles in ${minutes} minute${minutes === 1 ? '' : 's'}, whatever is tangled in it is up for grabs. Salvage crews, sharpen your hooks.`,
      };
    }
    case 'contract': {
      const minutes = Math.max(
        1,
        Math.round((new Date(event.brewingEndsAt).getTime() - new Date(event.createdAt).getTime()) / 60000)
      );
      const label = commodityLabel(event.params.commodity);
      return {
        subject: `TNN Contract Desk: TerraCorp Needs ${label}`,
        body: `TNN Contract Desk: TerraCorp is stocking up and paying haulers to do the lifting. Deliver ${event.params.goal} units of ${label} to the port in Sector ${firstSector} and everyone who delivers splits a ${event.params.pool} credit pool by share. Deliveries start counting when the contract opens in ${minutes} minute${minutes === 1 ? '' : 's'}. Miss the goal and the pool still pays, at half rate.`,
      };
    }
    case 'pirate_flotilla': {
      const shipCount = event.params.shipsSpawned ?? 0;
      const raiderSectors: number[] = event.params.raiderSectors || [];
      const redFlag = raiderSectors.length > 0
        ? ` RED FLAG: raiders in sectors ${sectorList(raiderSectors)} attack on sight. Their sectors are marked.`
        : '';
      return {
        subject: 'TNN Flash: Pirate Flotilla Sighted',
        body: `TNN Flash: a pirate flotilla of ${shipCount} ships is moving into sectors ${sectorList(event.regionSectors)}. Toll pirates there stop traders and take ten percent of cargo as their price for safe passage. Pay it, run, or fight, the choice is yours when they hail.${redFlag} The flotilla arrives in ${BREWING_MINUTES} minutes.`,
      };
    }
  }
};

const tnnStart = (event: DynamicEvent): { subject: string; body: string } => {
  const firstSector = event.regionSectors[0];
  switch (event.type) {
    case 'ion_storm':
      return {
        subject: 'TNN Weather Desk: Ion Storm Active',
        body: `TNN Weather Desk: the ion storm near Sector ${firstSector} is now live across sectors ${event.regionSectors.join(', ')}. Warp jumps in the region may misfire, cost extra turns, or fail. No ship has ever been lost to a storm. Cargo space permitting, storm sectors also cough up salvage.`,
      };
    case 'incursion':
      return {
        subject: 'TNN Flash: Alien Incursion Confirmed',
        body: `TNN Flash: alien incursion confirmed in Sector ${firstSector}. Local ports are trading at emergency rates until it clears. Defenses requested. Salvage rights to whoever clears it.`,
      };
    case 'port_strike':
      return {
        subject: 'TNN Labor Wire: Port Strike Begins',
        body: `TNN Labor Wire: the walkout at Sector ${firstSector} is on. No trade, no refuel, no repairs until the strike resolves. Prices are frozen where they stood. Reroute and the neighbouring ports will pay for the detour.`,
      };
    case 'trade_boom': {
      const label = commodityLabel(event.params.commodity);
      return {
        subject: `TNN Market Watch: ${label} Boom On`,
        body: `TNN Market Watch: the ${label} boom is live. Ports in sectors ${sectorList(event.regionSectors)} are paying up to 30% more for ${label} until the rush cools off.`,
      };
    }
    case 'salvage_field':
      return {
        subject: 'TNN Salvage Desk: Debris Field Live',
        body: `TNN Salvage Desk: the debris field around Sector ${firstSector} has settled. Derelicts are drifting in sectors ${sectorList(event.regionSectors)}. First finder takes all, and whatever is still out there when the field breaks up drifts beyond reach.`,
      };
    case 'contract': {
      const label = commodityLabel(event.params.commodity);
      return {
        subject: 'TNN Contract Desk: TerraCorp Contract Open',
        body: `TNN Contract Desk: the TerraCorp contract at Sector ${firstSector} is open. Every unit of ${label} sold to that port counts toward the ${event.params.goal} unit goal, and the ${event.params.pool} credit pool splits by share delivered. Haulers, start your runs.`,
      };
    }
    case 'pirate_flotilla':
      return {
        subject: `TNN Flash: Flotilla Working Sectors ${sectorList(event.regionSectors)}`,
        body: `TNN Flash: the pirate flotilla is live in sectors ${sectorList(event.regionSectors)}. Tolls are being collected, raiders are live, and TerraCorp pays a bonus for every pirate hull destroyed. Losing to a pirate costs your cargo and nothing else.`,
      };
  }
};

const tnnResolution = (event: DynamicEvent): { subject: string; body: string } => {
  const firstSector = event.regionSectors[0];
  switch (event.type) {
    case 'ion_storm':
      return {
        subject: 'TNN Weather Desk: Storm Clears',
        body: `TNN Weather Desk: the ion storm near Sector ${firstSector} has blown itself out. Warp routes in the region are reliable again.`,
      };
    case 'incursion':
      return {
        subject: 'TNN Flash: Incursion Over',
        body: `TNN Flash: the alien presence in Sector ${firstSector} is gone. Ports in the sector are back to normal rates.`,
      };
    case 'port_strike':
      return {
        subject: 'TNN Labor Wire: Strike Settled',
        body: `TNN Labor Wire: the strike at Sector ${firstSector} is settled. The port has restocked to full and its prices have dipped while crews celebrate. First ships in get the deal.`,
      };
    case 'trade_boom': {
      const label = commodityLabel(event.params.commodity);
      return {
        subject: `TNN Market Watch: ${label} Boom Over`,
        body: `TNN Market Watch: the ${label} rush around Sector ${firstSector} has cooled off. Ports in the region are back to their usual rates.`,
      };
    }
    case 'salvage_field':
      return {
        subject: 'TNN Salvage Desk: Field Swept Clean',
        body: `TNN Salvage Desk: the debris field around Sector ${firstSector} has broken up. Unclaimed wrecks have drifted beyond reach. What was pulled out of it stays pulled.`,
      };
    case 'contract': {
      const label = commodityLabel(event.params.commodity);
      const s = event.params.settlement as ContractSettlement | undefined;
      const goal = event.params.goal ?? CONTRACT_GOAL_UNITS;
      const poolCredits = event.params.pool ?? 0;
      if (!s || s.totalDelivered <= 0) {
        return {
          subject: 'TNN Contract Desk: Contract Expires Empty',
          body: `TNN Contract Desk: the TerraCorp contract at Sector ${firstSector} expired with no deliveries at all. The ${poolCredits} credit pool goes unclaimed. TerraCorp will buy elsewhere.`,
        };
      }
      const topLine = s.topContributorName
        ? ` Top hauler: ${s.topContributorName} with ${s.topContributorAmount} units.`
        : '';
      if (s.goalMet) {
        return {
          subject: 'TNN Contract Desk: Contract Fulfilled',
          body: `TNN Contract Desk: haulers delivered ${s.totalDelivered} units of ${label} to Sector ${firstSector}, past the ${goal} unit goal. The ${poolCredits} credit pool has been split by share.${topLine}`,
        };
      }
      return {
        subject: 'TNN Contract Desk: Contract Falls Short',
        body: `TNN Contract Desk: the TerraCorp contract at Sector ${firstSector} closed at ${s.totalDelivered} of ${goal} units of ${label}. Contributors are paid pro rata at half rate, ${s.distributed} credits split by share.${topLine}`,
      };
    }
    case 'pirate_flotilla': {
      const kills = event.params.kills ?? 0;
      const killLine = kills > 0
        ? ` ${kills} pirate ship${kills === 1 ? '' : 's'} went down during the visit.`
        : ' No pirate ships were destroyed.';
      return {
        subject: 'TNN Flash: Flotilla Moves On',
        body: `TNN Flash: the pirate flotilla working sectors ${sectorList(event.regionSectors)} has moved on. Surviving pirates have left the region with whatever they were carrying.${killLine}`,
      };
    }
  }
};

/**
 * Create a brewing event in a universe. Exported for the tick, the
 * admin force start endpoint, and tests. Returns null when the
 * concurrency cap, cooldown, or targeting rules block creation.
 */
export const createEvent = async (
  client: any,
  universeId: number,
  type: DynamicEventType,
  options: { brewingMinutes?: number } = {}
): Promise<DynamicEvent | null> => {
  const liveRes = await client.query(
    `SELECT COUNT(*) AS count FROM dynamic_events
     WHERE universe_id = $1 AND state IN ('brewing', 'active')`,
    [universeId]
  );
  if (parseInt(liveRes.rows[0].count, 10) >= MAX_CONCURRENT_EVENTS) return null;

  const brewingMinutes = options.brewingMinutes ?? BREWING_MINUTES;
  const activeHours = randInt(2, 4);

  let regionSectors: number[] = [];
  let targetPortId: number | null = null;
  let params: Record<string, any> = {};
  let portSectorName: string | null = null;

  if (type === 'ion_storm') {
    const sectorRes = await client.query(
      `SELECT sector_number FROM sectors
       WHERE universe_id = $1 AND sector_number > $2
       ORDER BY RANDOM() LIMIT 1`,
      [universeId, TERRASPACE_MAX_SECTOR]
    );
    if (sectorRes.rows.length === 0) return null;
    const center: number = sectorRes.rows[0].sector_number;
    const neighbours = (await getAdjacentSectors(client, universeId, center))
      .filter((n) => n > TERRASPACE_MAX_SECTOR)
      .slice(0, 4);
    regionSectors = [center, ...neighbours];
    params = { salvageChance: STORM_SALVAGE_CHANCE };
  } else if (type === 'incursion') {
    const sectorRes = await client.query(
      `SELECT sector_number FROM sectors
       WHERE universe_id = $1 AND sector_number > $2
       ORDER BY RANDOM() LIMIT 1`,
      [universeId, TERRASPACE_MAX_SECTOR]
    );
    if (sectorRes.rows.length === 0) return null;
    regionSectors = [sectorRes.rows[0].sector_number];
    params = {
      defenders: { fighters: randInt(25, 45), shields: randInt(150, 350) },
      spreadChance: 0.5,
      spreadDone: false,
      contacted: false,
    };
  } else if (type === 'trade_boom') {
    // Trade boom: seed at a port outside TerraSpace that buys at least
    // one commodity, boom one of the commodities it buys, then spread
    // the region out along the warps.
    const portRes = await client.query(
      `SELECT sector_number, port_type FROM sectors
       WHERE universe_id = $1 AND sector_number > $2
         AND port_type IS NOT NULL AND port_type != 'STARDOCK'
         AND port_type LIKE '%B%'
       ORDER BY RANDOM() LIMIT 1`,
      [universeId, TERRASPACE_MAX_SECTOR]
    );
    if (portRes.rows.length === 0) return null;
    const seed = portRes.rows[0];
    const letters = String(seed.port_type).split('');
    const bought = COMMODITIES.filter((_, i) => letters[i] === 'B');
    if (bought.length === 0) return null;
    const commodity = bought[randInt(0, bought.length - 1)];
    const target = randInt(TRADE_BOOM_MIN_SECTORS, TRADE_BOOM_MAX_SECTORS);
    regionSectors = (await walkBoomRegion(client, universeId, seed.sector_number, target))
      .filter((n) => n > TERRASPACE_MAX_SECTOR);
    if (regionSectors.length === 0) return null;
    params = { commodity, bonus: TRADE_BOOM_BONUS };
  } else if (type === 'salvage_field') {
    // Salvage field: a small linked region outside TerraSpace. Nothing
    // spawns while it brews; the derelicts drop in on activation and
    // the leftovers are swept away at resolution.
    const sectorRes = await client.query(
      `SELECT sector_number FROM sectors
       WHERE universe_id = $1 AND sector_number > $2
       ORDER BY RANDOM() LIMIT 1`,
      [universeId, TERRASPACE_MAX_SECTOR]
    );
    if (sectorRes.rows.length === 0) return null;
    const target = randInt(SALVAGE_FIELD_MIN_SECTORS, SALVAGE_FIELD_MAX_SECTORS);
    regionSectors = (await walkBoomRegion(client, universeId, sectorRes.rows[0].sector_number, target))
      .filter((n) => n > TERRASPACE_MAX_SECTOR);
    if (regionSectors.length === 0) return null;
    params = { derelictCount: randInt(SALVAGE_FIELD_MIN_DERELICTS, SALVAGE_FIELD_MAX_DERELICTS) };
  } else if (type === 'contract') {
    // TerraCorp contract: one port outside TerraSpace, never Stardock,
    // that buys at least one commodity. The contract counts units of
    // one of those commodities sold to that port while it is active.
    const portRes = await client.query(
      `SELECT id, sector_number, name, port_type FROM sectors
       WHERE universe_id = $1 AND sector_number > $2
         AND port_type IS NOT NULL AND port_type != 'STARDOCK'
         AND port_type LIKE '%B%'
       ORDER BY RANDOM() LIMIT 1`,
      [universeId, TERRASPACE_MAX_SECTOR]
    );
    if (portRes.rows.length === 0) return null;
    const port = portRes.rows[0];
    const letters = String(port.port_type).split('');
    const bought = COMMODITIES.filter((_, i) => letters[i] === 'B');
    if (bought.length === 0) return null;
    const commodity = bought[randInt(0, bought.length - 1)];
    const goal = CONTRACT_GOAL_UNITS;
    const poolCredits =
      CONTRACT_BASE_POOL + Math.floor(goal * (COMMODITY_BASE_PRICES[commodity] ?? 0) * CONTRACT_POOL_RATE);
    regionSectors = [port.sector_number];
    targetPortId = port.id;
    portSectorName = port.name;
    params = { commodity, goal, pool: poolCredits };
  } else if (type === 'pirate_flotilla') {
    // Pirate flotilla: a small linked region outside TerraSpace,
    // walked the same way a trade boom region is. Nothing spawns
    // while the event brews; the ship plan is fixed now so the TNN
    // forecast can name the raider sectors up front, and the hulls
    // drop in when the event goes active.
    let region: number[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const sectorRes = await client.query(
        `SELECT sector_number FROM sectors
         WHERE universe_id = $1 AND sector_number > $2
         ORDER BY RANDOM() LIMIT 1`,
        [universeId, TERRASPACE_MAX_SECTOR]
      );
      if (sectorRes.rows.length === 0) break;
      const target = randInt(FLOTILLA_MIN_REGION, FLOTILLA_MAX_REGION);
      const walked = (await walkBoomRegion(client, universeId, sectorRes.rows[0].sector_number, target))
        .filter((n) => n > TERRASPACE_MAX_SECTOR);
      if (walked.length > region.length) region = walked;
      if (region.length >= FLOTILLA_MIN_REGION) break;
    }
    if (region.length === 0) return null;
    regionSectors = region;
    const plan = buildFlotillaPlan(region);
    params = {
      shipsSpawned: plan.length,
      shipPlan: plan,
      raiderSectors: plan.filter((p) => p.isRaider).map((p) => p.sector),
      kills: 0,
    };
  } else {
    // Port strike: a real port outside TerraSpace, never Stardock.
    const portRes = await client.query(
      `SELECT id, sector_number, name, port_type FROM sectors
       WHERE universe_id = $1 AND sector_number > $2
         AND port_type IS NOT NULL AND port_type != 'STARDOCK'
       ORDER BY RANDOM() LIMIT 1`,
      [universeId, TERRASPACE_MAX_SECTOR]
    );
    if (portRes.rows.length === 0) return null;
    const port = portRes.rows[0];
    regionSectors = [port.sector_number];
    targetPortId = port.id;
    portSectorName = port.name;
    // The port's specialty is what it buys (its B slots).
    const letters = String(port.port_type).split('');
    const commodities = ['fuel', 'organics', 'equipment'];
    params = {
      specialty: commodities.filter((_, i) => letters[i] === 'B'),
      portType: port.port_type,
    };
  }

  const insertRes = await client.query(
    `INSERT INTO dynamic_events
       (universe_id, type, state, region_sectors, target_port_id,
        brewing_ends_at, active_ends_at, params)
     VALUES ($1, $2, 'brewing', $3, $4,
        NOW() + ($5 || ' minutes')::INTERVAL,
        NOW() + ($5 || ' minutes')::INTERVAL + ($6 || ' hours')::INTERVAL,
        $7)
     RETURNING *`,
    [
      universeId,
      type,
      JSON.stringify(regionSectors),
      targetPortId,
      String(brewingMinutes),
      String(activeHours),
      JSON.stringify(params),
    ]
  );

  const event = toEvent(insertRes.rows[0]);

  try {
    const note = tnnForecast(event, portSectorName);
    await broadcastTNN(universeId, note.subject, note.body);
  } catch {
    // Broadcast is best effort; the event still brews.
  }

  return event;
};

export interface ContractSettlement {
  goalMet: boolean;
  totalDelivered: number;
  goal: number;
  pool: number;
  distributed: number;
  contributorCount: number;
  topContributorName: string | null;
  topContributorAmount: number;
}

/**
 * Count one delivery toward a TerraCorp contract: a player sold the
 * contract commodity at the contract port while the contract is
 * active. Called from the port sell path with the trade's own client,
 * so the count lands or rolls back with the sale itself. No active
 * contract on that sector and commodity means no counting, which is
 * what keeps brewing, resolved, other ports, and other commodities
 * out of the tally.
 */
export const recordContractDelivery = async (
  client: any,
  universeId: number,
  sectorNumber: number,
  playerId: number,
  commodity: string,
  quantity: number
): Promise<void> => {
  if (quantity <= 0) return;
  const eventRes = await client.query(
    `SELECT id FROM dynamic_events
     WHERE universe_id = $1 AND type = 'contract' AND state = 'active'
       AND region_sectors @> $2::jsonb
       AND params->>'commodity' = $3
     ORDER BY created_at ASC
     LIMIT 1`,
    [universeId, JSON.stringify([sectorNumber]), commodity]
  );
  if (eventRes.rows.length === 0) return;
  await client.query(
    `INSERT INTO dynamic_event_contributions (event_id, player_id, amount)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id, player_id)
     DO UPDATE SET amount = dynamic_event_contributions.amount + EXCLUDED.amount`,
    [eventRes.rows[0].id, playerId, quantity]
  );
};

/**
 * Contract progress for displays: total units delivered so far, and
 * one player's own delivered units when asked.
 */
export const getContractProgress = async (
  eventId: number,
  playerId?: number
): Promise<{ totalDelivered: number; playerDelivered: number }> => {
  try {
    const totalRes = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM dynamic_event_contributions WHERE event_id = $1`,
      [eventId]
    );
    let playerDelivered = 0;
    if (playerId) {
      const playerRes = await query(
        `SELECT amount FROM dynamic_event_contributions
         WHERE event_id = $1 AND player_id = $2`,
        [eventId, playerId]
      );
      playerDelivered = playerRes.rows.length > 0 ? playerRes.rows[0].amount : 0;
    }
    return { totalDelivered: parseInt(totalRes.rows[0].total, 10) || 0, playerDelivered };
  } catch {
    return { totalDelivered: 0, playerDelivered: 0 };
  }
};

/**
 * Settle a TerraCorp contract: split the pool between contributors by
 * share of units delivered, at full rate when the goal was met and
 * half rate when it was missed, so effort is never wasted. Each
 * payout is claimed through the paid_credits null guard before the
 * player is credited, which is what makes settling exactly once even
 * if resolution runs twice. Credits only ever go up here; settlement
 * touches nothing else a player owns.
 */
export const settleContract = async (client: any, event: DynamicEvent): Promise<ContractSettlement> => {
  const goal = event.params.goal ?? CONTRACT_GOAL_UNITS;
  const poolCredits = event.params.pool ?? 0;

  const contribRes = await client.query(
    `SELECT c.player_id, c.amount,
            COALESCE(u.username, p.corp_name, 'Unknown Trader') AS name
     FROM dynamic_event_contributions c
     JOIN players p ON p.id = c.player_id
     LEFT JOIN users u ON u.id = p.user_id
     WHERE c.event_id = $1 AND c.amount > 0
     ORDER BY c.amount DESC, c.player_id ASC`,
    [event.id]
  );

  const totalDelivered = contribRes.rows.reduce((sum: number, r: any) => sum + r.amount, 0);
  const goalMet = totalDelivered >= goal;
  const distributable = Math.floor(poolCredits * (goalMet ? 1 : CONTRACT_MISS_RATE));

  let distributed = 0;
  for (const row of contribRes.rows) {
    const share = totalDelivered > 0 ? Math.floor((distributable * row.amount) / totalDelivered) : 0;
    const claim = await client.query(
      `UPDATE dynamic_event_contributions
       SET paid_credits = $1
       WHERE event_id = $2 AND player_id = $3 AND paid_credits IS NULL
       RETURNING player_id`,
      [share, event.id, row.player_id]
    );
    if ((claim.rowCount ?? 0) === 0) continue;
    if (share > 0) {
      await client.query(
        `UPDATE players SET credits = credits + $1 WHERE id = $2`,
        [share, row.player_id]
      );
    }
    distributed += share;
  }

  const top = contribRes.rows[0];
  return {
    goalMet,
    totalDelivered,
    goal,
    pool: poolCredits,
    distributed,
    contributorCount: contribRes.rows.length,
    topContributorName: top ? top.name : null,
    topContributorAmount: top ? top.amount : 0,
  };
};

/**
 * Spawn a flotilla's pirate hulls from the plan fixed at creation.
 * Pirates are alien_ships rows owned by the event through
 * dynamic_event_id; the encounter service in flotillaService runs
 * their fights, and the alien movement and aggression ticks never
 * touch them. Returns the params additions (ship ids, raider ids).
 */
export const spawnFlotillaPirates = async (
  client: any,
  event: DynamicEvent
): Promise<{ shipIds: number[]; raiders: number[] }> => {
  const plan: FlotillaShipPlan[] = event.params.shipPlan || [];

  // Ship type: an existing mid range hull name, the same pool alien
  // generation picks from, so the max fighters and shields joins in
  // alien queries keep working.
  const typeRes = await client.query(
    `SELECT name FROM ship_types
     WHERE (universe_id = $1 OR universe_id IS NULL)
       AND name IN ('Scout', 'Trader', 'Freighter', 'Merchant Cruiser')
     ORDER BY cost_credits ASC`,
    [event.universeId]
  );
  const typeNames: string[] = typeRes.rows.map((r: any) => r.name);
  const shipType = typeNames.length > 0
    ? typeNames[Math.min(1, typeNames.length - 1)]
    : 'Freighter';

  const shipIds: number[] = [];
  const raiders: number[] = [];
  for (const ship of plan) {
    const bounty = FLOTILLA_BOUNTY_BASE + FLOTILLA_BOUNTY_PER_FIGHTER * ship.fighters;
    const res = await client.query(
      `INSERT INTO alien_ships (
         universe_id, sector_number, alien_race, ship_name, ship_type,
         behavior, fighters, shields, credits, alignment, home_sector,
         cargo_fuel, cargo_organics, cargo_equipment, current_sector,
         dynamic_event_id, is_raider, bounty_value
       )
       VALUES ($1, $2, 'Pirate', $3, $4, 'pirate', $5, $6, $7, -200, $2,
               $8, $9, $10, $2, $11, $12, $13)
       RETURNING id`,
      [
        event.universeId, ship.sector, ship.shipName, shipType,
        ship.fighters, ship.shields, ship.credits,
        ship.cargoFuel, ship.cargoOrganics, ship.cargoEquipment,
        event.id, ship.isRaider, bounty,
      ]
    );
    shipIds.push(res.rows[0].id);
    if (ship.isRaider) raiders.push(res.rows[0].id);
  }
  return { shipIds, raiders };
};

/**
 * Apply the effects that land when an event goes active.
 */
const applyActivationEffects = async (client: any, event: DynamicEvent): Promise<void> => {
  if (event.type === 'pirate_flotilla') {
    // The flotilla arrives: pirate hulls drop into the region.
    const spawned = await spawnFlotillaPirates(client, event);
    event.params = { ...event.params, shipIds: spawned.shipIds, raiders: spawned.raiders };
    await client.query(
      `UPDATE dynamic_events SET params = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(event.params), event.id]
    );
    return;
  }

  if (event.type === 'salvage_field') {
    // The field settles: derelicts drop into the region, tagged with
    // this event so resolution can sweep whatever nobody claimed.
    const wanted = event.params.derelictCount ?? SALVAGE_FIELD_MIN_DERELICTS;
    const spawned = await spawnEventDerelicts(client, event.universeId, event.regionSectors, event.id, wanted);
    event.params = { ...event.params, spawnedDerelicts: spawned };
    await client.query(
      `UPDATE dynamic_events SET params = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(event.params), event.id]
    );
    return;
  }

  if (event.type !== 'port_strike') return;

  // Neighbouring ports feel the demand: their drift rises for the
  // struck port's specialty commodities, so rerouted traders get paid.
  const struckSector = event.regionSectors[0];
  const neighbours = await getAdjacentSectors(client, event.universeId, struckSector);
  const specialty: string[] = event.params.specialty || ['fuel', 'organics', 'equipment'];

  for (const sectorNumber of neighbours) {
    const portRes = await client.query(
      `SELECT 1 FROM sectors WHERE universe_id = $1 AND sector_number = $2 AND port_type IS NOT NULL`,
      [event.universeId, sectorNumber]
    );
    if (portRes.rows.length === 0) continue;
    for (const commodity of specialty) {
      await client.query(
        `INSERT INTO port_economy (universe_id, sector_number, commodity, drift, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (universe_id, sector_number, commodity)
         DO UPDATE SET drift = LEAST(0.4, port_economy.drift + EXCLUDED.drift), updated_at = NOW()`,
        [event.universeId, sectorNumber, commodity, STRIKE_DEMAND_DRIFT]
      );
    }
  }
};

/**
 * Apply the aftermath when an event resolves.
 */
const applyResolutionEffects = async (client: any, event: DynamicEvent): Promise<void> => {
  if (event.type === 'pirate_flotilla') {
    // The flotilla moves on: surviving pirates leave the universe
    // with whatever they were carrying, and any hail still hanging
    // open lapses. Encounter rows for the deleted pirates cascade
    // away with their ships.
    await client.query(
      `DELETE FROM alien_ships WHERE dynamic_event_id = $1`,
      [event.id]
    );
    await client.query(
      `UPDATE pirate_encounters
       SET state = 'expired', resolved_at = NOW()
       WHERE event_id = $1 AND state = 'hailed'`,
      [event.id]
    );
    return;
  }

  if (event.type === 'salvage_field') {
    // Sweep the field: delete only this event's derelicts that are
    // still 'spotted', meaning never boarded or looted. Claimed,
    // boarded, and fighting wrecks stay exactly where they are, and
    // derelicts that were drifting before the event (event_id null)
    // are never touched.
    await client.query(
      `DELETE FROM derelicts WHERE event_id = $1 AND state = 'spotted'`,
      [event.id]
    );
    return;
  }

  if (event.type === 'contract') {
    // Settle the pool. The settlement summary rides along in params
    // so the TNN resolution can report the outcome and top hauler.
    const settlement = await settleContract(client, event);
    event.params = { ...event.params, settlement };
    await client.query(
      `UPDATE dynamic_events SET params = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(event.params), event.id]
    );
    return;
  }

  if (event.type !== 'port_strike') return;

  // Restock surge: the struck port comes back full, and its prices
  // dip briefly through the existing surplus machinery.
  await client.query(
    `UPDATE sectors
     SET port_fuel_qty = GREATEST(port_fuel_qty, 1000),
         port_organics_qty = GREATEST(port_organics_qty, 1000),
         port_equipment_qty = GREATEST(port_equipment_qty, 1000)
     WHERE id = $1`,
    [event.targetPortId]
  );

  const struckSector = event.regionSectors[0];
  for (const commodity of ['fuel', 'organics', 'equipment']) {
    await client.query(
      `INSERT INTO port_economy (universe_id, sector_number, commodity, event_state, event_ends_at, updated_at)
       VALUES ($1, $2, $3, 'surplus', NOW() + ($4 || ' minutes')::INTERVAL, NOW())
       ON CONFLICT (universe_id, sector_number, commodity)
       DO UPDATE SET event_state = 'surplus',
                     event_ends_at = NOW() + ($4 || ' minutes')::INTERVAL,
                     updated_at = NOW()`,
      [event.universeId, struckSector, commodity, String(STRIKE_SURGE_MINUTES)]
    );
  }
};

const resolveEvent = async (client: any, event: DynamicEvent): Promise<void> => {
  await client.query(
    `UPDATE dynamic_events
     SET state = 'resolved', resolved_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [event.id]
  );
  await applyResolutionEffects(client, event);
  try {
    const note = tnnResolution(event);
    await broadcastTNN(event.universeId, note.subject, note.body);
  } catch {
    // Best effort.
  }
};

/**
 * Advance every live event across all universes by one step:
 * brewing to active when the forecast window closes, active to
 * resolved when the duration runs out. An ignored incursion may
 * spread once instead of resolving.
 */
export const advanceEvents = async (client: any): Promise<void> => {
  const due = await client.query(
    `SELECT * FROM dynamic_events
     WHERE (state = 'brewing' AND brewing_ends_at <= NOW())
        OR (state = 'active' AND active_ends_at <= NOW())
     ORDER BY created_at ASC`
  );

  for (const row of due.rows) {
    const event = toEvent(row);
    try {
      if (event.state === 'brewing') {
        await client.query(
          `UPDATE dynamic_events SET state = 'active', updated_at = NOW() WHERE id = $1`,
          [event.id]
        );
        await applyActivationEffects(client, event);
        try {
          const note = tnnStart(event);
          await broadcastTNN(event.universeId, note.subject, note.body);
        } catch {
          // Best effort.
        }
      } else if (event.type === 'incursion' && !event.params.spreadDone) {
        // Ignored for its full duration: it may spread instead of ending.
        if (Math.random() < (event.params.spreadChance ?? 0.5)) {
          const neighbours = (await getAdjacentSectors(client, event.universeId, event.regionSectors[0]))
            .filter((n) => n > TERRASPACE_MAX_SECTOR && !event.regionSectors.includes(n));
          if (neighbours.length > 0) {
            const target = neighbours[randInt(0, neighbours.length - 1)];
            const newRegion = [...event.regionSectors, target];
            const newParams = { ...event.params, spreadDone: true };
            await client.query(
              `UPDATE dynamic_events
               SET region_sectors = $1, params = $2,
                   active_ends_at = NOW() + ($3 || ' hours')::INTERVAL,
                   updated_at = NOW()
               WHERE id = $4`,
              [JSON.stringify(newRegion), JSON.stringify(newParams), String(SPREAD_EXTEND_HOURS), event.id]
            );
            try {
              await broadcastTNN(
                event.universeId,
                'TNN Flash: Incursion Spreading',
                `TNN Flash: the incursion in Sector ${event.regionSectors[0]} has spread to Sector ${target}. Nobody answered the first call. The offer of salvage stands for both sectors.`
              );
            } catch {
              // Best effort.
            }
            continue;
          }
        }
        await resolveEvent(client, event);
      } else {
        await resolveEvent(client, event);
      }
    } catch (error) {
      console.error(`[DynamicEvents] Error advancing event ${event.id}:`, error);
    }
  }
};

/**
 * Maybe seed a new event in a universe, respecting the concurrency
 * cap, the admin cooldown, and a minimum gap since the last event.
 */
const maybeSeedEvent = async (client: any, universeId: number): Promise<void> => {
  const settingsRes = await client.query(
    `SELECT cooldown_until, events_enabled FROM dynamic_event_settings WHERE universe_id = $1`,
    [universeId]
  );
  if (settingsRes.rows.length > 0 && settingsRes.rows[0].events_enabled === false) {
    // Events are switched off in this universe. Events already
    // brewing or active are untouched: advanceEvents still runs for
    // them and they finish naturally. Only new seeding stops.
    return;
  }
  if (
    settingsRes.rows.length > 0 &&
    settingsRes.rows[0].cooldown_until &&
    new Date(settingsRes.rows[0].cooldown_until) > new Date()
  ) {
    return;
  }

  const lastRes = await client.query(
    `SELECT MAX(created_at) AS last_created FROM dynamic_events WHERE universe_id = $1`,
    [universeId]
  );
  const lastCreated = lastRes.rows[0]?.last_created;
  if (lastCreated && Date.now() - new Date(lastCreated).getTime() < SEED_COOLDOWN_MINUTES * 60 * 1000) {
    return;
  }

  if (Math.random() > SEED_CHANCE) return;

  const type = EVENT_TYPES[randInt(0, EVENT_TYPES.length - 1)];
  await createEvent(client, universeId, type);
};

/**
 * Fight the alien incursion in the player's current sector.
 * Resolves through the same round based combat core as ghost ship
 * boarding. Events never destroy a player's ship: a beaten pilot
 * limps away with a single fighter instead of dying.
 */
export const attackIncursion = async (
  playerId: number
): Promise<{
  success: boolean;
  message: string;
  victory?: boolean;
  rounds?: number;
  salvage?: { fuel: number; organics: number; equipment: number; credits: number };
}> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const playerRes = await client.query(
      `SELECT id, universe_id, current_sector, turns_remaining, credits,
              cargo_fuel, cargo_organics, cargo_equipment,
              ship_holds_max, ship_fighters, ship_shields
       FROM players WHERE id = $1 FOR UPDATE`,
      [playerId]
    );
    if (playerRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found' };
    }
    const player = playerRes.rows[0];

    if (player.turns_remaining < 1) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Not enough turns to engage the incursion' };
    }

    const eventRes = await client.query(
      `SELECT * FROM dynamic_events
       WHERE universe_id = $1 AND type = 'incursion' AND state = 'active'
         AND region_sectors @> $2::jsonb
       FOR UPDATE
       LIMIT 1`,
      [player.universe_id, JSON.stringify([player.current_sector])]
    );
    if (eventRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'No active incursion in this sector' };
    }
    const event = toEvent(eventRes.rows[0]);
    const defenders = event.params.defenders || { fighters: 30, shields: 200 };

    const resolved = resolveCombatRounds(
      player.ship_fighters,
      player.ship_shields,
      defenders.fighters,
      defenders.shields
    );

    const victory = resolved.defenderFighters <= 0;
    // Fairness floor: the incursion cannot kill the player.
    const fightersLeft = Math.max(1, resolved.attackerFighters);
    const shieldsLeft = Math.max(0, resolved.attackerShields);

    await client.query(
      `UPDATE players
       SET ship_fighters = $1, ship_shields = $2, turns_remaining = turns_remaining - 1
       WHERE id = $3`,
      [fightersLeft, shieldsLeft, playerId]
    );

    const firstContact = !event.params.contacted;
    const newParams = { ...event.params, contacted: true };

    if (victory) {
      // Alien salvage: equipment and organics into the hold (space
      // permitting, equipment first), credits straight to the account.
      const salvage = {
        fuel: 0,
        organics: randInt(5, 20),
        equipment: randInt(10, 30),
        credits: randInt(3000, 9000),
      };
      const used = player.cargo_fuel + player.cargo_organics + player.cargo_equipment;
      let free = Math.max(0, player.ship_holds_max - used);
      const equipmentLoaded = Math.min(salvage.equipment, free);
      free -= equipmentLoaded;
      const organicsLoaded = Math.min(salvage.organics, free);
      salvage.equipment = equipmentLoaded;
      salvage.organics = organicsLoaded;

      await client.query(
        `UPDATE players
         SET cargo_equipment = cargo_equipment + $1,
             cargo_organics = cargo_organics + $2,
             credits = credits + $3
         WHERE id = $4`,
        [equipmentLoaded, organicsLoaded, salvage.credits, playerId]
      );

      // The kill counts on the hunter leaderboard, like a bounty claim.
      await client.query(
        `INSERT INTO bounty_hunters (player_id, bounties_claimed, bounty_credits_earned)
         VALUES ($1, 1, $2)
         ON CONFLICT (player_id)
         DO UPDATE SET
           bounties_claimed = bounty_hunters.bounties_claimed + 1,
           bounty_credits_earned = bounty_hunters.bounty_credits_earned + $2,
           updated_at = NOW()`,
        [playerId, salvage.credits]
      );

      await client.query(
        `UPDATE dynamic_events
         SET state = 'resolved', resolved_at = NOW(), updated_at = NOW(), params = $1
         WHERE id = $2`,
        [JSON.stringify(newParams), event.id]
      );

      await client.query('COMMIT');

      try {
        if (firstContact) {
          await broadcastTNN(
            player.universe_id,
            'TNN Flash: First Contact',
            `TNN Flash: first contact in Sector ${player.current_sector}. A lone pilot has engaged the incursion force.`
          );
        }
        await broadcastTNN(
          player.universe_id,
          'TNN Flash: Incursion Cleared',
          `TNN Flash: the incursion in Sector ${player.current_sector} has been cleared. Alien salvage recovered. Ports in the sector return to normal rates.`
        );
      } catch {
        // Best effort.
      }

      return {
        success: true,
        victory: true,
        rounds: resolved.rounds,
        message: `Incursion cleared in ${resolved.rounds} rounds. You recover alien salvage and ${salvage.credits.toLocaleString()} credits.`,
        salvage,
      };
    }

    // The incursion survives, weakened by whatever damage was dealt.
    const weakenedParams: Record<string, any> = {
      ...newParams,
      defenders: {
        fighters: Math.max(0, resolved.defenderFighters),
        shields: Math.max(0, resolved.defenderShields),
      },
    };
    await client.query(
      `UPDATE dynamic_events SET params = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(weakenedParams), event.id]
    );

    await client.query('COMMIT');

    if (firstContact) {
      try {
        await broadcastTNN(
          player.universe_id,
          'TNN Flash: First Contact',
          `TNN Flash: first contact in Sector ${player.current_sector}. A pilot has engaged the incursion force and been driven off. The incursion still holds the sector.`
        );
      } catch {
        // Best effort.
      }
    }

    return {
      success: true,
      victory: false,
      rounds: resolved.rounds,
      message: `The incursion drove you off after ${resolved.rounds} rounds. You limp away with ${fightersLeft} fighter${fightersLeft === 1 ? '' : 's'} left. The incursion is weakened but still holds the sector.`,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Admin and history: most recent events, newest first.
 */
export const listEvents = async (universeId?: number, limit = 50): Promise<DynamicEvent[]> => {
  const result = universeId
    ? await query(
        `SELECT * FROM dynamic_events WHERE universe_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [universeId, limit]
      )
    : await query(
        `SELECT * FROM dynamic_events ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
  return result.rows.map(toEvent);
};

/**
 * Admin: force an event to start brewing right now. Uses the
 * standard brewing window, so the TNN forecast still precedes any
 * effect, exactly like a seeded event.
 */
export const forceStartEvent = async (
  universeId: number,
  type: DynamicEventType
): Promise<DynamicEvent | null> => {
  const client = await pool.connect();
  try {
    return await createEvent(client, universeId, type);
  } finally {
    client.release();
  }
};

/**
 * Admin: force resolve a live event, applying its aftermath.
 */
export const forceResolveEvent = async (eventId: number): Promise<boolean> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `SELECT * FROM dynamic_events WHERE id = $1 AND state IN ('brewing', 'active') FOR UPDATE`,
      [eventId]
    );
    if (res.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    await resolveEvent(client, toEvent(res.rows[0]));
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Admin: suppress new event seeding in a universe for a while.
 */
export const setEventCooldown = async (universeId: number, minutes: number): Promise<void> => {
  await query(
    `INSERT INTO dynamic_event_settings (universe_id, cooldown_until, updated_at)
     VALUES ($1, NOW() + ($2 || ' minutes')::INTERVAL, NOW())
     ON CONFLICT (universe_id)
     DO UPDATE SET cooldown_until = NOW() + ($2 || ' minutes')::INTERVAL, updated_at = NOW()`,
    [universeId, String(minutes)]
  );
};

export interface DynamicEventSettings {
  eventsEnabled: boolean;
  cooldownUntil: string | null;
}

/**
 * Admin: current event settings for a universe. A universe with no
 * settings row runs with the shipped defaults: events enabled, no
 * seeding cooldown.
 */
export const getEventSettings = async (universeId: number): Promise<DynamicEventSettings> => {
  const result = await query(
    `SELECT events_enabled, cooldown_until FROM dynamic_event_settings WHERE universe_id = $1`,
    [universeId]
  );
  if (result.rows.length === 0) {
    return { eventsEnabled: true, cooldownUntil: null };
  }
  return {
    eventsEnabled: result.rows[0].events_enabled !== false,
    cooldownUntil: result.rows[0].cooldown_until,
  };
};

/**
 * Admin: switch event seeding on or off for a universe. Only seeding
 * is gated: events already brewing or active finish naturally.
 */
export const setEventsEnabled = async (
  universeId: number,
  enabled: boolean
): Promise<DynamicEventSettings> => {
  await query(
    `INSERT INTO dynamic_event_settings (universe_id, events_enabled, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (universe_id)
     DO UPDATE SET events_enabled = $2, updated_at = NOW()`,
    [universeId, enabled]
  );
  return getEventSettings(universeId);
};

/**
 * Flotilla drift: on each event tick, every live pirate in an active
 * flotilla takes one warp step to a random neighbour inside its own
 * region. Pirates are event property; the alien movement tick never
 * moves them, and region membership is checked on every step, so a
 * pirate can never drift out of the flotilla's ground or into
 * TerraSpace. Quietly does nothing on a database where migration
 * 040 has not landed yet.
 */
export const driftFlotillaPirates = async (client: any): Promise<void> => {
  let eventsRes: any;
  try {
    eventsRes = await client.query(
      `SELECT * FROM dynamic_events WHERE type = 'pirate_flotilla' AND state = 'active'`
    );
  } catch {
    return;
  }

  for (const row of eventsRes.rows) {
    const event = toEvent(row);
    const pirates = await client.query(
      `SELECT id, current_sector FROM alien_ships WHERE dynamic_event_id = $1`,
      [event.id]
    );
    for (const pirate of pirates.rows) {
      const from = pirate.current_sector as number;
      const neighbours = (await getAdjacentSectors(client, event.universeId, from))
        .filter((n) => n !== from && event.regionSectors.includes(n));
      if (neighbours.length === 0) continue;
      const next = neighbours[randInt(0, neighbours.length - 1)];
      await client.query(
        `UPDATE alien_ships
         SET current_sector = $1, sector_number = $1, last_move_at = NOW()
         WHERE id = $2`,
        [next, pirate.id]
      );
    }
  }
};

/**
 * Run one dynamic event tick across all universes.
 */
export const runDynamicEventTick = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await advanceEvents(client);
    await driftFlotillaPirates(client);

    const universes = await client.query(`SELECT id FROM universes`);
    for (const universe of universes.rows) {
      try {
        await maybeSeedEvent(client, universe.id);
      } catch (error) {
        console.error('[DynamicEvents] Seeding error:', error);
      }
    }
  } finally {
    client.release();
  }
};

/**
 * Start the dynamic event tick on an interval. Follows the
 * maintenanceService pattern.
 */
export const startDynamicEventTick = (intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout => {
  console.log('[DynamicEvents] Starting dynamic event tick every 5 minutes');

  runDynamicEventTick().catch((error) => {
    console.error('[DynamicEvents] Tick error:', error);
  });

  return setInterval(() => {
    runDynamicEventTick().catch((error) => {
      console.error('[DynamicEvents] Tick error:', error);
    });
  }, intervalMs);
};
