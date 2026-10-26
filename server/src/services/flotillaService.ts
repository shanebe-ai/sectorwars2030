import { pool, query } from '../db/connection';
import { broadcastTNN } from './broadcastService';
import { resolveCombatRounds, ResolvedCombatRounds } from './combatService';
import {
  getAdjacentSectors,
  getStormForMove,
  rollStormEffect,
} from './dynamicEventService';

// Pirate flotilla encounter service: hails, tolls, flees, fights,
// and raids for the pirate_flotilla dynamic event.
//
// The fairness contract, in code:
// - One loss path only. applyCargoStrip is the single function that
//   applies a pirate victory, and it touches exactly the six cargo
//   columns. Credits, bank, ship, and pod state are never modified
//   by any flotilla code path.
// - Fights run through the shared combat core (resolveCombatRounds),
//   never the alien combat simulator behind attackAlienShip, which
//   can destroy the player. Damage persists on both sides, with the
//   incursion floor: player fighters bottom out at 1, shields at 0.
// - Paying a toll buys the terms that pirate offers, and only that.
//   A pirate names permanent peace or a cooldown, and whether it
//   honors its own word is rolled once at payment time (see
//   PIRATE_DISHONESTY_CHANCE). No payment is a guarantee.

export const PIRATE_DISHONESTY_CHANCE = 0.25;
const TOLL_RATE = 0.1;
const FLEE_SUCCESS_CHANCE = 0.6;
const PEACE_PERMANENT_CHANCE = 0.5;
const PEACE_COOLDOWN_MINUTES: [number, number] = [20, 45];
const WORD_BREAK_MINUTES: [number, number] = [5, 15];

const LEGAL_CARGO = ['cargo_fuel', 'cargo_organics', 'cargo_equipment'] as const;
const CONTRABAND_CARGO = ['cargo_banned_tech', 'cargo_restricted_meds', 'cargo_stolen_artifacts'] as const;
const CARGO_COLUMNS = [...LEGAL_CARGO, ...CONTRABAND_CARGO] as const;

type DemandAmountKey = 'fuel' | 'organics' | 'equipment' | 'bannedTech' | 'restrictedMeds' | 'stolenArtifacts';

const DEMAND_KEY: Record<string, DemandAmountKey> = {
  cargo_fuel: 'fuel',
  cargo_organics: 'organics',
  cargo_equipment: 'equipment',
  cargo_banned_tech: 'bannedTech',
  cargo_restricted_meds: 'restrictedMeds',
  cargo_stolen_artifacts: 'stolenArtifacts',
};

const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const totalCargo = (player: any): number =>
  CARGO_COLUMNS.reduce((sum, col) => sum + (player[col] || 0), 0);

export interface TollDemand {
  fuel: number;
  organics: number;
  equipment: number;
  bannedTech: number;
  restrictedMeds: number;
  stolenArtifacts: number;
  // Peace terms ride in the same JSON once a toll is paid.
  terms?: 'permanent' | 'cooldown';
  cooldownUntil?: string;
  honorsWord?: boolean;
  breakAt?: string;
}

export interface FlotillaEncounterView {
  id: number;
  eventId: number;
  pirateShipId: number;
  pirateName: string;
  isRaider: boolean;
  kind: 'toll' | 'raid';
  state: string;
  demand: TollDemand;
  sector: number;
}

export interface FlotillaActionResult {
  success: boolean;
  message: string;
  movedOn?: boolean;
  victory?: boolean;
  lost?: boolean;
  fled?: boolean;
  rounds?: number;
  prize?: number;
  bonus?: number;
  stormEffect?: string | null;
}

const MOVED_ON_MESSAGE = 'The flotilla has moved on.';

const snapshotDemand = (player: any): TollDemand => {
  const demand: Record<string, number> = {};
  for (const col of CARGO_COLUMNS) {
    demand[DEMAND_KEY[col]] = Math.floor((player[col] || 0) * TOLL_RATE);
  }
  return demand as unknown as TollDemand;
};

const demandTotal = (demand: TollDemand): number =>
  demand.fuel + demand.organics + demand.equipment +
  demand.bannedTech + demand.restrictedMeds + demand.stolenArtifacts;

/**
 * The one and only pirate victory: every cargo column to zero in a
 * single update. Nothing else about the player changes, ever.
 */
export const applyCargoStrip = async (client: any, playerId: number): Promise<void> => {
  await client.query(
    `UPDATE players
     SET cargo_fuel = 0, cargo_organics = 0, cargo_equipment = 0,
         cargo_banned_tech = 0, cargo_restricted_meds = 0,
         cargo_stolen_artifacts = 0
     WHERE id = $1`,
    [playerId]
  );
};

interface FightOutcome {
  resolved: ResolvedCombatRounds;
  pirateDead: boolean;
  lost: boolean;
  fightersLeft: number;
  shieldsLeft: number;
}

/**
 * Resolve one fight between a player and a pirate through the shared
 * combat core, persisting damage on both sides. The player can never
 * die here: fighters floor at 1 and shields at 0, and a loss applies
 * the cargo strip. The pirate keeps its damage between fights, so a
 * weakened pirate stays weakened for the next pilot.
 */
const resolvePirateFight = async (
  client: any,
  player: any,
  pirate: any
): Promise<FightOutcome> => {
  const resolved = resolveCombatRounds(
    player.ship_fighters,
    player.ship_shields,
    pirate.fighters,
    pirate.shields
  );

  const pirateDead = resolved.defenderFighters <= 0;
  const fightersLeft = Math.max(1, resolved.attackerFighters);
  const shieldsLeft = Math.max(0, resolved.attackerShields);

  await client.query(
    `UPDATE players SET ship_fighters = $1, ship_shields = $2 WHERE id = $3`,
    [fightersLeft, shieldsLeft, player.id]
  );

  if (!pirateDead) {
    await client.query(
      `UPDATE alien_ships SET fighters = $1, shields = $2 WHERE id = $3`,
      [Math.max(0, resolved.defenderFighters), Math.max(0, resolved.defenderShields), pirate.id]
    );
  }

  // Lost means the pirate won the exchange outright. A draw at the
  // round cap where the pirate holds more fighters already reads as
  // a defender win in the combat core, which is the spec's rule.
  const lost = !pirateDead && resolved.winner === 'defender';
  if (lost) {
    await applyCargoStrip(client, player.id);
  }

  return { resolved, pirateDead, lost, fightersLeft, shieldsLeft };
};

interface KillPayout {
  prize: number;
  bonus: number;
  cargoTaken: { fuel: number; organics: number; equipment: number };
  remainingPirates: number;
  eventCleared: boolean;
}

/**
 * Pay out a pirate kill in the caller's transaction: prize credits,
 * the TerraCorp bonus, the hunter leaderboard upsert, cargo salvage
 * (equipment first, space permitting, the incursion order), the
 * pirate row deleted, the kill counted on the event, and an inbox
 * breakdown for the killer. When the last pirate dies the event
 * resolves on the spot; the caller broadcasts the TNN lines after
 * commit.
 */
const payOutKill = async (
  client: any,
  event: any,
  pirate: any,
  player: any
): Promise<KillPayout> => {
  const prize = pirate.credits || 0;
  const bonus = pirate.bounty_value || 0;

  const used = totalCargo(player);
  let free = Math.max(0, (player.ship_holds_max || 0) - used);
  const equipment = Math.min(pirate.cargo_equipment || 0, free);
  free -= equipment;
  const organics = Math.min(pirate.cargo_organics || 0, free);
  free -= organics;
  const fuel = Math.min(pirate.cargo_fuel || 0, free);

  await client.query(
    `UPDATE players
     SET credits = credits + $1,
         cargo_equipment = cargo_equipment + $2,
         cargo_organics = cargo_organics + $3,
         cargo_fuel = cargo_fuel + $4
     WHERE id = $5`,
    [prize + bonus, equipment, organics, fuel, player.id]
  );

  await client.query(
    `INSERT INTO bounty_hunters (player_id, bounties_claimed, bounty_credits_earned)
     VALUES ($1, 1, $2)
     ON CONFLICT (player_id)
     DO UPDATE SET
       bounties_claimed = bounty_hunters.bounties_claimed + 1,
       bounty_credits_earned = bounty_hunters.bounty_credits_earned + $2,
       updated_at = NOW()`,
    [player.id, prize + bonus]
  );

  await client.query(`DELETE FROM alien_ships WHERE id = $1`, [pirate.id]);

  const params = { ...(event.params || {}) };
  params.kills = (params.kills || 0) + 1;
  await client.query(
    `UPDATE dynamic_events SET params = $1, updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(params), event.id]
  );

  const remainingRes = await client.query(
    `SELECT COUNT(*) AS count FROM alien_ships WHERE dynamic_event_id = $1`,
    [event.id]
  );
  const remainingPirates = parseInt(remainingRes.rows[0].count, 10);
  const eventCleared = remainingPirates === 0;

  if (eventCleared) {
    await client.query(
      `UPDATE dynamic_events
       SET state = 'resolved', resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [event.id]
    );
    await client.query(
      `UPDATE pirate_encounters
       SET state = 'expired', resolved_at = NOW()
       WHERE event_id = $1 AND state = 'hailed'`,
      [event.id]
    );
  }

  await client.query(
    `INSERT INTO messages (universe_id, sender_id, recipient_id, sender_name, subject, body, message_type)
     VALUES ($1, NULL, $2, 'TerraCorp Bounty Office', $3, $4, 'DIRECT')`,
    [
      player.universe_id,
      player.id,
      `Bounty paid: ${pirate.ship_name}`,
      `TerraCorp bounty paid for destroying the pirate ${pirate.ship_name} in Sector ${pirate.current_sector}. ` +
        `Prize credits seized: ${prize.toLocaleString()}. TerraCorp bonus: ${bonus.toLocaleString()}. ` +
        `Cargo recovered: ${equipment} equipment, ${organics} organics, ${fuel} fuel ore.`,
    ]
  );

  return { prize, bonus, cargoTaken: { fuel, organics, equipment }, remainingPirates, eventCleared };
};

/**
 * TNN lines for a kill, sent after the caller's transaction commits:
 * every kill gets its own line (reporters always know), and clearing
 * the last pirate closes the flotilla out.
 */
const broadcastKill = async (
  universeId: number,
  pirate: any,
  killerName: string,
  eventCleared: boolean
): Promise<void> => {
  try {
    await broadcastTNN(
      universeId,
      'TNN Flash: Pirate Down',
      `TNN Flash: the pirate ${pirate.ship_name} has been destroyed in Sector ${pirate.current_sector} by ${killerName}. TerraCorp has paid the bounty.`
    );
    if (eventCleared) {
      await broadcastTNN(
        universeId,
        'TNN Flash: Flotilla Broken',
        `TNN Flash: the last pirate of the flotilla has been destroyed in Sector ${pirate.current_sector}. The flotilla is broken, and traders in the region can breathe again.`
      );
    }
  } catch {
    // Best effort, like every other TNN call.
  }
};

const toView = (encounter: any, pirate: any): FlotillaEncounterView => ({
  id: encounter.id,
  eventId: encounter.event_id,
  pirateShipId: pirate.id,
  pirateName: pirate.ship_name,
  isRaider: !!pirate.is_raider,
  kind: encounter.kind,
  state: encounter.state,
  demand: encounter.demand || {},
  sector: pirate.current_sector,
});

/**
 * Present a toll hail to the player standing in a pirate's sector,
 * creating the encounter on presentation so the demand is fixed
 * before the player decides anything. Returns null when no hail
 * applies: no live toll pirate here, the player is in an escape pod,
 * the hold is empty (or so light the toll rounds to nothing), or a
 * paid peace is still in force with this pirate.
 */
export const presentHailForPlayer = async (
  playerId: number
): Promise<FlotillaEncounterView | null> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const playerRes = await client.query(
      `SELECT * FROM players WHERE id = $1 FOR UPDATE`,
      [playerId]
    );
    if (playerRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const player = playerRes.rows[0];

    if (player.in_escape_pod || totalCargo(player) <= 0) {
      await client.query('COMMIT');
      return null;
    }

    const pirateRes = await client.query(
      `SELECT a.* FROM alien_ships a
       JOIN dynamic_events e ON e.id = a.dynamic_event_id
       WHERE a.universe_id = $1 AND a.current_sector = $2
         AND a.dynamic_event_id IS NOT NULL AND a.is_raider = FALSE
         AND e.state = 'active'
       ORDER BY a.id ASC`,
      [player.universe_id, player.current_sector]
    );
    if (pirateRes.rows.length === 0) {
      await client.query('COMMIT');
      return null;
    }

    for (const pirate of pirateRes.rows) {
      const view = await presentForPirate(client, player, pirate);
      if (view) {
        await client.query('COMMIT');
        return view;
      }
    }

    await client.query('COMMIT');
    return null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const presentForPirate = async (
  client: any,
  player: any,
  pirate: any
): Promise<FlotillaEncounterView | null> => {
  const encRes = await client.query(
    `SELECT * FROM pirate_encounters
     WHERE pirate_ship_id = $1 AND player_id = $2 AND kind = 'toll'
     FOR UPDATE`,
    [pirate.id, player.id]
  );

  if (encRes.rows.length === 0) {
    const demand = snapshotDemand(player);
    if (demandTotal(demand) <= 0) return null;
    const inserted = await client.query(
      `INSERT INTO pirate_encounters (event_id, pirate_ship_id, player_id, kind, state, demand)
       VALUES ($1, $2, $3, 'toll', 'hailed', $4)
       RETURNING *`,
      [pirate.dynamic_event_id, pirate.id, player.id, JSON.stringify(demand)]
    );
    return toView(inserted.rows[0], pirate);
  }

  const encounter = encRes.rows[0];

  if (encounter.state === 'hailed') {
    return toView(encounter, pirate);
  }

  if (encounter.state !== 'paid') {
    return null;
  }

  // A paid peace, judged by the terms that pirate offered and
  // whether it means to keep them. An honest pirate never hails
  // again on permanent terms, and waits out its own cooldown on
  // cooldown terms. A dishonest one comes back as soon as its
  // private window lapses, whatever it swore.
  const terms = (encounter.demand || {}) as TollDemand;
  const now = Date.now();
  if (terms.honorsWord) {
    if (terms.terms === 'permanent') return null;
    if (terms.cooldownUntil && now < new Date(terms.cooldownUntil).getTime()) return null;
  } else if (terms.breakAt && now < new Date(terms.breakAt).getTime()) {
    return null;
  }

  // The peace has lapsed (or the word was worthless): a fresh hail,
  // on the recycled encounter row, with a fresh demand snapshot.
  const demand = snapshotDemand(player);
  if (demandTotal(demand) <= 0) return null;
  const updated = await client.query(
    `UPDATE pirate_encounters
     SET state = 'hailed', demand = $1, created_at = NOW(), resolved_at = NULL
     WHERE id = $2
     RETURNING *`,
    [JSON.stringify(demand), encounter.id]
  );
  return toView(updated.rows[0], pirate);
};

/**
 * Lock and load the encounter, its pirate, and its event for an
 * action endpoint. Returns nulls when anything the action depends on
 * is gone, which the endpoints report as the flotilla having moved
 * on.
 */
const loadEncounterForAction = async (
  client: any,
  encounterId: number,
  playerId: number
): Promise<{ encounter: any; pirate: any; event: any } | null> => {
  const encRes = await client.query(
    `SELECT * FROM pirate_encounters WHERE id = $1 AND player_id = $2 FOR UPDATE`,
    [encounterId, playerId]
  );
  if (encRes.rows.length === 0) return null;
  const encounter = encRes.rows[0];

  const pirateRes = await client.query(
    `SELECT * FROM alien_ships WHERE id = $1 FOR UPDATE`,
    [encounter.pirate_ship_id]
  );
  const eventRes = await client.query(
    `SELECT * FROM dynamic_events WHERE id = $1 FOR UPDATE`,
    [encounter.event_id]
  );
  return {
    encounter,
    pirate: pirateRes.rows.length > 0 ? pirateRes.rows[0] : null,
    event: eventRes.rows.length > 0 ? eventRes.rows[0] : null,
  };
};

const lockPlayer = async (client: any, playerId: number): Promise<any> => {
  const res = await client.query(
    `SELECT * FROM players WHERE id = $1 FOR UPDATE`,
    [playerId]
  );
  return res.rows.length > 0 ? res.rows[0] : null;
};

/**
 * Pay an open toll hail. Legal units transfer to the pirate;
 * contraband units are taken off the player and fenced by the
 * pirate, stored nowhere. Credits are never part of a toll. Paying
 * buys the terms that pirate offers: permanent peace for the rest
 * of the event, or a cooldown, and the pirate may break its word.
 */
export const payToll = async (
  playerId: number,
  encounterId: number
): Promise<FlotillaActionResult> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const player = await lockPlayer(client, playerId);
    if (!player) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found' };
    }

    const loaded = await loadEncounterForAction(client, encounterId, playerId);
    if (!loaded || !loaded.pirate || !loaded.event || loaded.event.state !== 'active') {
      await client.query('ROLLBACK');
      return { success: true, movedOn: true, message: MOVED_ON_MESSAGE };
    }
    const { encounter, pirate } = loaded;

    if (encounter.kind !== 'toll' || encounter.state !== 'hailed') {
      await client.query('ROLLBACK');
      return { success: false, message: 'That hail is no longer open.' };
    }

    const demand = (encounter.demand || {}) as TollDemand;
    const taken: Record<string, number> = {};
    for (const col of CARGO_COLUMNS) {
      taken[col] = Math.min(player[col] || 0, demand[DEMAND_KEY[col]] || 0);
    }

    await client.query(
      `UPDATE players
       SET cargo_fuel = cargo_fuel - $1,
           cargo_organics = cargo_organics - $2,
           cargo_equipment = cargo_equipment - $3,
           cargo_banned_tech = cargo_banned_tech - $4,
           cargo_restricted_meds = cargo_restricted_meds - $5,
           cargo_stolen_artifacts = cargo_stolen_artifacts - $6
       WHERE id = $7`,
      [
        taken.cargo_fuel, taken.cargo_organics, taken.cargo_equipment,
        taken.cargo_banned_tech, taken.cargo_restricted_meds,
        taken.cargo_stolen_artifacts, playerId,
      ]
    );

    // Legal units go into the pirate's own holds. Contraband is
    // fenced on the spot: alien_ships has no contraband columns.
    await client.query(
      `UPDATE alien_ships
       SET cargo_fuel = cargo_fuel + $1,
           cargo_organics = cargo_organics + $2,
           cargo_equipment = cargo_equipment + $3
       WHERE id = $4`,
      [taken.cargo_fuel, taken.cargo_organics, taken.cargo_equipment, pirate.id]
    );

    // The pirate sets its own terms, and rolls once, now, on whether
    // it will honor them. The player hears the terms. The honesty
    // roll stays private, which is the whole gamble of paying.
    const permanent = Math.random() < PEACE_PERMANENT_CHANCE;
    const honorsWord = Math.random() >= PIRATE_DISHONESTY_CHANCE;
    const cooldownMinutes = randInt(PEACE_COOLDOWN_MINUTES[0], PEACE_COOLDOWN_MINUTES[1]);
    const terms: TollDemand = {
      ...demand,
      terms: permanent ? 'permanent' : 'cooldown',
      honorsWord,
    };
    if (!permanent) {
      terms.cooldownUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000).toISOString();
    }
    if (!honorsWord) {
      terms.breakAt = new Date(
        Date.now() + randInt(WORD_BREAK_MINUTES[0], WORD_BREAK_MINUTES[1]) * 60 * 1000
      ).toISOString();
    }

    await client.query(
      `UPDATE pirate_encounters
       SET state = 'paid', demand = $1, resolved_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(terms), encounter.id]
    );

    await client.query('COMMIT');

    const paidUnits = CARGO_COLUMNS.reduce((sum, col) => sum + taken[col], 0);
    const termsLine = permanent
      ? `${pirate.ship_name} swears permanent peace for the rest of the flotilla's stay.`
      : `${pirate.ship_name} names a truce of ${cooldownMinutes} minutes.`;
    return {
      success: true,
      message:
        `You pay the toll of ${paidUnits} units of cargo to ${pirate.ship_name}. ${termsLine} ` +
        `Whether a pirate keeps its word is another matter.`,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Fight a pirate: through an open encounter (toll or raid), or
 * directly by ship id to hit a pirate before it hails, or a raider
 * at any time. Costs one turn. A kill pays out in the same
 * transaction.
 */
export const attackPirate = async (
  playerId: number,
  target: { encounterId?: number; pirateShipId?: number }
): Promise<FlotillaActionResult> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const player = await lockPlayer(client, playerId);
    if (!player) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found' };
    }
    if (player.in_escape_pod) {
      await client.query('ROLLBACK');
      return { success: false, message: 'You cannot attack from an escape pod.' };
    }
    if (player.ship_fighters <= 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'You have no fighters to attack with.' };
    }
    if (player.turns_remaining < 1) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Not enough turns to fight.' };
    }

    let encounter: any = null;
    let pirate: any = null;
    let event: any = null;

    if (target.encounterId) {
      const loaded = await loadEncounterForAction(client, target.encounterId, playerId);
      if (!loaded || !loaded.pirate || !loaded.event || loaded.event.state !== 'active') {
        await client.query('ROLLBACK');
        return { success: true, movedOn: true, message: MOVED_ON_MESSAGE };
      }
      encounter = loaded.encounter;
      pirate = loaded.pirate;
      event = loaded.event;
      if (encounter.state !== 'hailed') {
        await client.query('ROLLBACK');
        return { success: false, message: 'That encounter is already settled.' };
      }
    } else if (target.pirateShipId) {
      const pirateRes = await client.query(
        `SELECT * FROM alien_ships
         WHERE id = $1 AND dynamic_event_id IS NOT NULL
         FOR UPDATE`,
        [target.pirateShipId]
      );
      if (pirateRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, message: 'That ship is not a flotilla pirate.' };
      }
      pirate = pirateRes.rows[0];
      if (pirate.current_sector !== player.current_sector || pirate.universe_id !== player.universe_id) {
        await client.query('ROLLBACK');
        return { success: false, message: 'That pirate is not in this sector.' };
      }
      const eventRes = await client.query(
        `SELECT * FROM dynamic_events WHERE id = $1 FOR UPDATE`,
        [pirate.dynamic_event_id]
      );
      event = eventRes.rows.length > 0 ? eventRes.rows[0] : null;
      if (!event || event.state !== 'active') {
        await client.query('ROLLBACK');
        return { success: true, movedOn: true, message: MOVED_ON_MESSAGE };
      }
    } else {
      await client.query('ROLLBACK');
      return { success: false, message: 'No pirate target given.' };
    }

    await client.query(
      `UPDATE players SET turns_remaining = turns_remaining - 1 WHERE id = $1`,
      [playerId]
    );

    const fight = await resolvePirateFight(client, player, pirate);

    let payout: KillPayout | null = null;
    if (fight.pirateDead) {
      payout = await payOutKill(client, event, pirate, player);
    }

    if (encounter) {
      const nextState = fight.pirateDead || !fight.lost ? 'won' : 'lost';
      // An inconclusive fight over an open toll leaves the hail
      // standing: the pirate is damaged, the demand unpaid.
      if (!(encounter.kind === 'toll' && !fight.pirateDead && !fight.lost)) {
        await client.query(
          `UPDATE pirate_encounters SET state = $1, resolved_at = NOW() WHERE id = $2`,
          [nextState, encounter.id]
        );
      }
    }

    await client.query('COMMIT');

    if (payout) {
      await broadcastKill(player.universe_id, pirate, player.corp_name, payout.eventCleared);
      return {
        success: true,
        victory: true,
        rounds: fight.resolved.rounds,
        prize: payout.prize,
        bonus: payout.bonus,
        message:
          `${pirate.ship_name} is destroyed in ${fight.resolved.rounds} rounds. ` +
          `Prize and bounty come to ${(payout.prize + payout.bonus).toLocaleString()} credits, ` +
          `and whatever cargo fit in your holds is yours.`,
      };
    }
    if (fight.lost) {
      return {
        success: true,
        victory: false,
        lost: true,
        rounds: fight.resolved.rounds,
        message:
          `${pirate.ship_name} drives you off in ${fight.resolved.rounds} rounds and takes your cargo as its prize. ` +
          `Your ship limps away with ${fight.fightersLeft} fighter${fight.fightersLeft === 1 ? '' : 's'}.`,
      };
    }
    return {
      success: true,
      victory: false,
      lost: false,
      rounds: fight.resolved.rounds,
      message:
        `You trade fire with ${pirate.ship_name} for ${fight.resolved.rounds} rounds and break off. ` +
        `The pirate is damaged and still out there.`,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Flee an open toll hail: one warp turn buys a 60 percent run at a
 * neighbouring sector through the standard movement rules, ion
 * storm effects included. A failed run resolves as a fight on the
 * spot, with no second turn charged.
 */
export const fleeEncounter = async (
  playerId: number,
  encounterId: number,
  destinationSector: number
): Promise<FlotillaActionResult> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const player = await lockPlayer(client, playerId);
    if (!player) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found' };
    }

    const loaded = await loadEncounterForAction(client, encounterId, playerId);
    if (!loaded || !loaded.pirate || !loaded.event || loaded.event.state !== 'active') {
      await client.query('ROLLBACK');
      return { success: true, movedOn: true, message: MOVED_ON_MESSAGE };
    }
    const { encounter, pirate } = loaded;

    if (encounter.kind !== 'toll' || encounter.state !== 'hailed') {
      await client.query('ROLLBACK');
      return { success: false, message: 'That hail is no longer open.' };
    }
    if (player.turns_remaining < 1) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Not enough turns to run.' };
    }

    const neighbours = await getAdjacentSectors(client, player.universe_id, player.current_sector);
    if (!neighbours.includes(destinationSector)) {
      await client.query('ROLLBACK');
      return { success: false, message: 'That sector is not a warp away from here.' };
    }

    // The route may touch an active ion storm, exactly like a normal
    // warp. A failed jump in the storm costs the turn and the run
    // never starts; the hail stays open.
    const storm = await getStormForMove(player.universe_id, player.current_sector, destinationSector);
    const stormEffect = storm ? rollStormEffect() : 'none';

    let turnCost = 1;
    if (stormEffect === 'extra_turn') turnCost += 1;
    if (player.turns_remaining < turnCost) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Not enough turns to run through the storm.' };
    }

    await client.query(
      `UPDATE players SET turns_remaining = turns_remaining - $1 WHERE id = $2`,
      [turnCost, playerId]
    );

    if (stormEffect === 'fail') {
      await client.query('COMMIT');
      return {
        success: true,
        fled: false,
        stormEffect,
        message: 'Ion storm turbulence scrambled the jump and it failed, costing the turn. The pirate is still waiting.',
      };
    }

    if (Math.random() < FLEE_SUCCESS_CHANCE) {
      let arrival = destinationSector;
      if (stormEffect === 'misfire') {
        const around = (await getAdjacentSectors(client, player.universe_id, destinationSector))
          .filter((n) => n !== destinationSector && n !== player.current_sector);
        if (around.length > 0) {
          arrival = around[randInt(0, around.length - 1)];
        }
      }
      await client.query(
        `UPDATE players SET current_sector = $1 WHERE id = $2`,
        [arrival, playerId]
      );
      await client.query(
        `UPDATE pirate_encounters SET state = 'fled', resolved_at = NOW() WHERE id = $1`,
        [encounter.id]
      );
      await client.query('COMMIT');
      return {
        success: true,
        fled: true,
        stormEffect: stormEffect !== 'none' ? stormEffect : null,
        message: stormEffect === 'misfire'
          ? `The storm threw your jump off course, but you are clear of ${pirate.ship_name}, arriving in Sector ${arrival}.`
          : `You outrun ${pirate.ship_name} and make Sector ${arrival} clean.`,
      };
    }

    // The run fails: the fight resolves immediately, the pirate
    // defending, and no second turn is charged.
    const fight = await resolvePirateFight(client, player, pirate);
    let payout: KillPayout | null = null;
    if (fight.pirateDead) {
      payout = await payOutKill(client, loaded.event, pirate, player);
    }
    if (fight.pirateDead || fight.lost) {
      await client.query(
        `UPDATE pirate_encounters SET state = $1, resolved_at = NOW() WHERE id = $2`,
        [fight.pirateDead ? 'won' : 'lost', encounter.id]
      );
    }

    await client.query('COMMIT');

    if (payout) {
      await broadcastKill(player.universe_id, pirate, player.corp_name, payout.eventCleared);
      return {
        success: true,
        fled: false,
        victory: true,
        rounds: fight.resolved.rounds,
        prize: payout.prize,
        bonus: payout.bonus,
        message:
          `${pirate.ship_name} cuts off your run, and the fight turns: the pirate is destroyed in ${fight.resolved.rounds} rounds. ` +
          `Prize and bounty come to ${(payout.prize + payout.bonus).toLocaleString()} credits.`,
      };
    }
    if (fight.lost) {
      return {
        success: true,
        fled: false,
        victory: false,
        lost: true,
        rounds: fight.resolved.rounds,
        message:
          `${pirate.ship_name} cuts off your run and wins the fight in ${fight.resolved.rounds} rounds, taking your cargo as its prize.`,
      };
    }
    return {
      success: true,
      fled: false,
      rounds: fight.resolved.rounds,
      message:
        `${pirate.ship_name} cuts off your run, but you fight it to a standstill over ${fight.resolved.rounds} rounds. The hail still stands.`,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Resolve a raid when a warp lands a player in a live raider's
 * sector. Called from the movement completion path, once per entry.
 * Cargo carriers only, never escape pods. The fight costs no turn:
 * the warp already charged one, and the pirate picked this fight.
 */
export const resolveRaidOnEntry = async (
  playerId: number,
  universeId: number,
  sectorNumber: number
): Promise<FlotillaActionResult | null> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const player = await lockPlayer(client, playerId);
    if (!player || player.universe_id !== universeId || player.current_sector !== sectorNumber) {
      await client.query('ROLLBACK');
      return null;
    }
    if (player.in_escape_pod || totalCargo(player) <= 0) {
      await client.query('COMMIT');
      return null;
    }

    const raiderRes = await client.query(
      `SELECT a.* FROM alien_ships a
       JOIN dynamic_events e ON e.id = a.dynamic_event_id
       WHERE a.universe_id = $1 AND a.current_sector = $2
         AND a.dynamic_event_id IS NOT NULL AND a.is_raider = TRUE
         AND e.state = 'active'
       ORDER BY a.id ASC
       LIMIT 1
       FOR UPDATE OF a`,
      [universeId, sectorNumber]
    );
    if (raiderRes.rows.length === 0) {
      await client.query('COMMIT');
      return null;
    }
    const pirate = raiderRes.rows[0];

    const eventRes = await client.query(
      `SELECT * FROM dynamic_events WHERE id = $1 FOR UPDATE`,
      [pirate.dynamic_event_id]
    );
    const event = eventRes.rows[0];

    const encRes = await client.query(
      `INSERT INTO pirate_encounters (event_id, pirate_ship_id, player_id, kind, state, demand)
       VALUES ($1, $2, $3, 'raid', 'hailed', NULL)
       RETURNING id`,
      [event.id, pirate.id, playerId]
    );
    const encounterId = encRes.rows[0].id;

    const fight = await resolvePirateFight(client, player, pirate);

    let payout: KillPayout | null = null;
    if (fight.pirateDead) {
      payout = await payOutKill(client, event, pirate, player);
    }

    await client.query(
      `UPDATE pirate_encounters SET state = $1, resolved_at = NOW() WHERE id = $2`,
      [fight.lost ? 'lost' : 'won', encounterId]
    );

    await client.query('COMMIT');

    if (payout) {
      await broadcastKill(universeId, pirate, player.corp_name, payout.eventCleared);
      return {
        success: true,
        victory: true,
        rounds: fight.resolved.rounds,
        prize: payout.prize,
        bonus: payout.bonus,
        message:
          `RAIDER ATTACK: ${pirate.ship_name} jumped you on entry and lost. The raider is destroyed, and prize plus bounty come to ${(payout.prize + payout.bonus).toLocaleString()} credits.`,
      };
    }
    if (fight.lost) {
      return {
        success: true,
        victory: false,
        lost: true,
        rounds: fight.resolved.rounds,
        message:
          `RAIDER ATTACK: ${pirate.ship_name} jumped you on entry and won in ${fight.resolved.rounds} rounds, stripping your cargo. Your ship survives.`,
      };
    }
    return {
      success: true,
      victory: false,
      rounds: fight.resolved.rounds,
      message:
        `RAIDER ATTACK: ${pirate.ship_name} jumped you on entry, and you fought it off over ${fight.resolved.rounds} rounds. It is damaged and still in this sector.`,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Display data for a flotilla event touching a sector: how many
 * pirates are still out there, and which sectors currently hold a
 * live raider. While the event brews, the numbers come from the
 * plan fixed at creation.
 */
export const getFlotillaSectorDisplay = async (
  event: { id: number; state: string; params: Record<string, any> }
): Promise<{ shipsRemaining: number; raiderSectors: number[]; kills: number }> => {
  const kills = event.params.kills ?? 0;
  if (event.state === 'brewing') {
    return {
      shipsRemaining: event.params.shipsSpawned ?? 0,
      raiderSectors: event.params.raiderSectors ?? [],
      kills,
    };
  }
  try {
    const res = await query(
      `SELECT current_sector, is_raider FROM alien_ships WHERE dynamic_event_id = $1`,
      [event.id]
    );
    return {
      shipsRemaining: res.rows.length,
      raiderSectors: [...new Set(res.rows.filter((r: any) => r.is_raider).map((r: any) => r.current_sector as number))],
      kills,
    };
  } catch {
    return {
      shipsRemaining: event.params.shipsSpawned ?? 0,
      raiderSectors: event.params.raiderSectors ?? [],
      kills,
    };
  }
};

/**
 * Sectors in a universe currently holding a live raider, for warp
 * list warnings. Empty on any database without the flotilla tables.
 */
export const getLiveRaiderSectors = async (universeId: number): Promise<number[]> => {
  try {
    const res = await query(
      `SELECT DISTINCT a.current_sector AS sector
       FROM alien_ships a
       JOIN dynamic_events e ON e.id = a.dynamic_event_id
       WHERE a.universe_id = $1 AND a.is_raider = TRUE AND e.state = 'active'`,
      [universeId]
    );
    return res.rows.map((r: any) => r.sector as number);
  } catch {
    return [];
  }
};
