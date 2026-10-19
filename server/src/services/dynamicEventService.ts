import { pool, query } from '../db/connection';
import { broadcastTNN } from './broadcastService';
import { resolveCombatRounds } from './combatService';

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

export type DynamicEventType = 'ion_storm' | 'incursion' | 'port_strike';
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

const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const EVENT_TYPES: DynamicEventType[] = ['ion_storm', 'incursion', 'port_strike'];

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
 * details endpoint uses).
 */
const getAdjacentSectors = async (
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

/**
 * Apply the effects that land when an event goes active.
 */
const applyActivationEffects = async (client: any, event: DynamicEvent): Promise<void> => {
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
    `SELECT cooldown_until FROM dynamic_event_settings WHERE universe_id = $1`,
    [universeId]
  );
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
 * Admin: force an event to start brewing right now, with a short
 * one minute forecast so the lifecycle still demonstrates itself.
 */
export const forceStartEvent = async (
  universeId: number,
  type: DynamicEventType
): Promise<DynamicEvent | null> => {
  const client = await pool.connect();
  try {
    return await createEvent(client, universeId, type, { brewingMinutes: 1 });
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

/**
 * Run one dynamic event tick across all universes.
 */
export const runDynamicEventTick = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await advanceEvents(client);

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
