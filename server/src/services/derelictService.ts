import { pool, query } from '../db/connection';
import { emitUniverseEvent } from '../index';
import { broadcastTNN } from './broadcastService';
import { resolveCombatRounds } from './combatService';

// Derelict tick: expire old derelicts and occasionally spawn new ones.
// Runs on an interval from the server entry point, following the
// startEconomyTick pattern.

const DERELICT_SPAWN_CHANCE = 0.06; // 6% chance per universe per tick
const MAX_ACTIVE_DERELICTS = 5;
const BOARD_TURN_COST = 3;
const LINER_FLAT_BOUNTY = 200000;
const LINER_SHIP_TYPE = 'merchant_cruiser'; // hull class a claimed liner becomes

export interface Derelict {
  id: number;
  universe_id: number;
  sector_number: number;
  type: 'wreck' | 'ghost' | 'liner';
  state: 'spotted' | 'boarded' | 'claimed';
  loot: any;
  claimed_by: number | null;
  expires_at: string;
}

interface LootTable {
  fuel: number;
  organics: number;
  equipment: number;
  credits: number;
}

const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const rollLoot = (type: 'wreck' | 'ghost'): LootTable => {
  if (type === 'ghost') {
    return {
      fuel: randInt(40, 100),
      organics: randInt(30, 80),
      equipment: randInt(20, 60),
      credits: randInt(5000, 20000),
    };
  }
  return {
    fuel: randInt(20, 60),
    organics: randInt(10, 40),
    equipment: randInt(5, 25),
    credits: 0,
  };
};

const rollDefenses = (): { fighters: number; shields: number } => ({
  fighters: randInt(20, 40),
  shields: randInt(100, 300),
});

// Roll a derelict type: wreck 60%, ghost 30%, liner 10%, and a liner
// only when no live liner is already drifting in the universe.
const rollDerelictType = async (
  client: any,
  universeId: number
): Promise<'wreck' | 'ghost' | 'liner'> => {
  const linerActive = await client.query(
    `SELECT 1 FROM derelicts
     WHERE universe_id = $1 AND type = 'liner' AND state != 'claimed' LIMIT 1`,
    [universeId]
  );
  const roll = Math.random();
  if (roll < 0.6) return 'wreck';
  if (roll < 0.9 || linerActive.rows.length > 0) return 'ghost';
  return 'liner';
};

// Insert one derelict in a sector, or return null when the sector
// already holds one. eventId tags derelicts spawned by a dynamic
// event so the event can sweep its own leftovers at resolution; the
// ambient spawner passes null.
const insertDerelict = async (
  client: any,
  universeId: number,
  sectorNumber: number,
  eventId: number | null
): Promise<'wreck' | 'ghost' | 'liner' | null> => {
  const type = await rollDerelictType(client, universeId);
  const loot = type === 'liner' ? {} : rollLoot(type);
  const expiresAt = `NOW() + INTERVAL '${randInt(12, 24)} hours'`;

  const res = await client.query(
    `INSERT INTO derelicts
       (universe_id, sector_number, type, state, loot, expires_at, event_id)
     VALUES ($1, $2, $3, 'spotted', $4, ${expiresAt}, $5)
     ON CONFLICT (universe_id, sector_number) DO NOTHING
     RETURNING id`,
    [universeId, sectorNumber, type, JSON.stringify(loot), eventId]
  );
  return (res.rowCount ?? 0) > 0 ? type : null;
};

/**
 * Spawn a single derelict in a universe. Picks a weighted type, a legal
 * sector, rolls loot and expiry, then posts a TNN rumor with an
 * approximate location (never the exact sector).
 */
const spawnDerelict = async (
  client: any,
  universeId: number,
  maxSectors: number
): Promise<void> => {
  // Legal sectors: outside TerraSpace, no port, no existing derelict.
  // Ghost ships may share a sector with an anomaly; that is the gamble.
  const sectorRes = await client.query(
    `SELECT sector_number FROM sectors
     WHERE universe_id = $1
       AND sector_number > 10
       AND port_type IS NULL
       AND sector_number NOT IN (
         SELECT sector_number FROM derelicts WHERE universe_id = $1
       )
     ORDER BY RANDOM() LIMIT 1`,
    [universeId]
  );
  if (sectorRes.rows.length === 0) return;
  const sectorNumber: number = sectorRes.rows[0].sector_number;

  const type = (await insertDerelict(client, universeId, sectorNumber, null)) ?? 'wreck';

  // TNN rumor with an approximate location, never the exact sector.
  const jitter = randInt(-5, 5);
  const rumorSector = Math.max(11, Math.min(maxSectors, sectorNumber + jitter));
  const typeLabel = type === 'wreck' ? 'derelict hulk' : type === 'ghost' ? 'ghost ship' : 'intact liner';
  try {
    await broadcastTNN(
      universeId,
      type === 'liner' ? 'Intact Liner Spotted' : 'Derelict Rumor',
      `Scouts report ${type === 'liner' ? 'an' : 'a'} ${typeLabel} drifting in the dark near Sector ${rumorSector}. First finder takes all.`
    );
  } catch {
    // Broadcast is best effort; the derelict still spawns.
  }
};

/**
 * Spawn derelicts for a salvage field event inside its region. Same
 * legality rules as ambient spawns (no port, no derelict already
 * there), each row tagged with the event id so resolution can sweep
 * the leftovers nobody claimed. Returns how many actually spawned.
 */
export const spawnEventDerelicts = async (
  client: any,
  universeId: number,
  regionSectors: number[],
  eventId: number,
  count: number
): Promise<number> => {
  if (regionSectors.length === 0 || count <= 0) return 0;
  const eligibleRes = await client.query(
    `SELECT sector_number FROM sectors
     WHERE universe_id = $1
       AND sector_number = ANY($2)
       AND port_type IS NULL
       AND sector_number NOT IN (
         SELECT sector_number FROM derelicts WHERE universe_id = $1
       )`,
    [universeId, regionSectors]
  );
  const eligible: number[] = eligibleRes.rows.map((r: any) => r.sector_number);
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  let spawned = 0;
  for (const sectorNumber of eligible) {
    if (spawned >= count) break;
    if (await insertDerelict(client, universeId, sectorNumber, eventId)) spawned++;
  }
  return spawned;
};

/**
 * Run one derelict tick across all universes: expire old derelicts,
 * then maybe spawn new ones.
 */
export const runDerelictTick = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(`DELETE FROM derelicts WHERE expires_at < NOW()`);

    const universes = await client.query(`SELECT id, max_sectors FROM universes`);
    for (const universe of universes.rows) {
      const countRes = await client.query(
        `SELECT COUNT(*) AS count FROM derelicts
         WHERE universe_id = $1 AND state != 'claimed'`,
        [universe.id]
      );
      if (parseInt(countRes.rows[0].count, 10) >= MAX_ACTIVE_DERELICTS) continue;
      if (Math.random() > DERELICT_SPAWN_CHANCE) continue;
      try {
        await spawnDerelict(client, universe.id, universe.max_sectors);
      } catch (error) {
        console.error('[Derelict] Spawn error:', error);
      }
    }
  } finally {
    client.release();
  }
};

/**
 * Start the derelict tick on an interval. Follows the maintenanceService pattern.
 */
export const startDerelictTick = (intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout => {
  console.log('[Derelict] Starting derelict tick every 5 minutes');

  runDerelictTick().catch((error) => {
    console.error('[Derelict] Tick error:', error);
  });

  return setInterval(() => {
    runDerelictTick().catch((error) => {
      console.error('[Derelict] Tick error:', error);
    });
  }, intervalMs);
};

/**
 * Get the active derelict in a player's current sector, if any.
 */
export const getDerelictInSector = async (
  universeId: number,
  sectorNumber: number
): Promise<Derelict | null> => {
  const result = await query(
    `SELECT * FROM derelicts
     WHERE universe_id = $1 AND sector_number = $2 AND state != 'claimed'
     LIMIT 1`,
    [universeId, sectorNumber]
  );
  return result.rows[0] || null;
};

export type BoardAction = 'loot' | 'claim_sell' | 'claim_swap';

export interface BoardResult {
  success: boolean;
  message: string;
  loot?: { fuel: number; organics: number; equipment: number; credits: number };
  combat?: { victory: boolean; rounds: number };
}

/**
 * Board the derelict in the player's current sector. Boarding costs turns
 * and locks the derelict in the same transaction as the payout, so two
 * players arriving together cannot dupe the loot.
 */
export const boardDerelict = async (
  playerId: number,
  action: BoardAction = 'loot'
): Promise<BoardResult> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const playerRes = await client.query(
      `SELECT id, universe_id, current_sector, turns_remaining, credits,
              cargo_fuel, cargo_organics, cargo_equipment,
              ship_holds_max, ship_fighters, ship_shields, ship_type
       FROM players WHERE id = $1 FOR UPDATE`,
      [playerId]
    );
    if (playerRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found' };
    }
    const player = playerRes.rows[0];

    if (player.turns_remaining < BOARD_TURN_COST) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Not enough turns to board' };
    }

    const derelictRes = await client.query(
      `SELECT * FROM derelicts
       WHERE universe_id = $1 AND sector_number = $2 AND state = 'spotted'
       FOR UPDATE`,
      [player.universe_id, player.current_sector]
    );
    if (derelictRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'No boardable derelict in this sector' };
    }
    const derelict: Derelict = derelictRes.rows[0];

    // Lock the derelict before any payout. If another player got here
    // first the state will already be boarded and this aborts.
    const lockRes = await client.query(
      `UPDATE derelicts SET state = 'boarded', updated_at = NOW()
       WHERE id = $1 AND state = 'spotted'`,
      [derelict.id]
    );
    if ((lockRes.rowCount || 0) === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Another crew is already aboard' };
    }

    await client.query(
      `UPDATE players SET turns_remaining = turns_remaining - $1 WHERE id = $2`,
      [BOARD_TURN_COST, playerId]
    );

    const loot: LootTable = {
      fuel: 0,
      organics: 0,
      equipment: 0,
      credits: 0,
      ...(derelict.loot || {}),
    };

    if (derelict.type === 'liner') {
      return await resolveLinerClaim(client, player, derelict, action);
    }

    if (derelict.type === 'ghost') {
      return await resolveGhostBoarding(client, player, derelict, loot);
    }

    return await resolveWreckBoarding(client, player, derelict, loot);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Load looted commodities into the hold, respecting free space.
 * Priority by value: equipment, then organics, then fuel.
 */
const creditWreckLoot = async (
  client: any,
  player: any,
  loot: LootTable
): Promise<{ fuel: number; organics: number; equipment: number }> => {
  const used = player.cargo_fuel + player.cargo_organics + player.cargo_equipment;
  let free = Math.max(0, player.ship_holds_max - used);

  const equipment = Math.min(loot.equipment, free);
  free -= equipment;
  const organics = Math.min(loot.organics, free);
  free -= organics;
  const fuel = Math.min(loot.fuel, free);

  await client.query(
    `UPDATE players SET
       cargo_fuel = cargo_fuel + $1,
       cargo_organics = cargo_organics + $2,
       cargo_equipment = cargo_equipment + $3
     WHERE id = $4`,
    [fuel, organics, equipment, player.id]
  );
  return { fuel, organics, equipment };
};

const markClaimed = async (
  client: any,
  derelictId: number,
  playerId: number
): Promise<void> => {
  await client.query(
    `UPDATE derelicts
     SET state = 'claimed', claimed_by = $2, updated_at = NOW()
     WHERE id = $1`,
    [derelictId, playerId]
  );
};

const resolveWreckBoarding = async (
  client: any,
  player: any,
  derelict: Derelict,
  loot: LootTable
): Promise<BoardResult> => {
  const taken = await creditWreckLoot(client, player, loot);
  await markClaimed(client, derelict.id, player.id);
  await client.query('COMMIT');

  try {
    emitUniverseEvent(player.universe_id, 'derelict_claimed', {
      sectorNumber: derelict.sector_number,
      type: 'wreck',
      playerId: player.id,
    });
  } catch {
    // Best effort.
  }

  return {
    success: true,
    message: `Stripped the wreck: ${taken.equipment} equipment, ${taken.organics} organics, ${taken.fuel} fuel loaded into your hold.`,
    loot: { ...taken, credits: 0 },
  };
};

const resolveGhostBoarding = async (
  client: any,
  player: any,
  derelict: Derelict,
  loot: LootTable
): Promise<BoardResult> => {
  // Automated defenses scale a little with the wreck. Ion storms kill
  // shields on both sides, which makes this a real gamble.
  const defenses = {
    fighters: randInt(20, 40),
    shields: randInt(100, 300),
  };
  let ionStorm = false;
  try {
    const anomalyRes = await client.query(
      `SELECT 1 FROM anomalies
       WHERE universe_id = $1 AND sector_number = $2 AND type = 'ion' AND ends_at > NOW()
       LIMIT 1`,
      [player.universe_id, player.current_sector]
    );
    ionStorm = anomalyRes.rows.length > 0;
  } catch {
    // Anomalies table may not exist yet; fight normally.
  }

  const result = resolveCombatRounds(
    player.ship_fighters,
    player.ship_shields,
    defenses.fighters,
    defenses.shields,
    { ionStorm }
  );

  const fightersLeft = Math.max(0, player.ship_fighters - result.attackerFightersLost);
  const shieldsLeft = Math.max(0, player.ship_shields - result.attackerShieldsLost);
  await client.query(
    `UPDATE players SET ship_fighters = $1, ship_shields = $2 WHERE id = $3`,
    [fightersLeft, shieldsLeft, player.id]
  );

  if (result.winner !== 'attacker') {
    // Limp out: the derelict stays spotted so someone else can try.
    await client.query(
      `UPDATE derelicts SET state = 'spotted', updated_at = NOW() WHERE id = $1`,
      [derelict.id]
    );
    await client.query('COMMIT');
    return {
      success: false,
      message: `The ghost ship defenses drove you off after ${result.rounds} rounds. You limp out with ${fightersLeft} fighters left.`,
      combat: { victory: false, rounds: result.rounds },
    };
  }

  const taken = await creditWreckLoot(client, player, loot);
  if (loot.credits > 0) {
    await client.query(`UPDATE players SET credits = credits + $1 WHERE id = $2`, [
      loot.credits,
      player.id,
    ]);
  }
  await markClaimed(client, derelict.id, player.id);
  await client.query('COMMIT');

  try {
    emitUniverseEvent(player.universe_id, 'derelict_claimed', {
      sectorNumber: derelict.sector_number,
      type: 'ghost',
      playerId: player.id,
    });
  } catch {
    // Best effort.
  }

  return {
    success: true,
    message: `Ghost ship silenced in ${result.rounds} rounds. Loot: ${taken.equipment} equipment, ${taken.organics} organics, ${taken.fuel} fuel, ${loot.credits} credits.`,
    loot: { ...taken, credits: loot.credits },
    combat: { victory: true, rounds: result.rounds },
  };
};

const resolveLinerClaim = async (
  client: any,
  player: any,
  derelict: Derelict,
  action: BoardAction
): Promise<BoardResult> => {
  if (action === 'claim_swap') {
    const shipRes = await client.query(
      `SELECT cost_credits, holds, fighters_max, shields_max
       FROM ship_types WHERE name = $1 AND universe_id IS NULL LIMIT 1`,
      [player.ship_type]
    );
    const currentCost = shipRes.rows.length > 0 ? parseInt(shipRes.rows[0].cost_credits, 10) : 0;
    if (currentCost >= LINER_FLAT_BOUNTY) {
      await client.query('ROLLBACK');
      return {
        success: false,
        message: 'Your current hull outclasses the liner. Sell it for the bounty instead.',
      };
    }
    // Swap into the liner hull, keeping current fighters and shields
    // capped at the new hull maximums.
    await client.query(
      `UPDATE players SET
         ship_type = $1,
         ship_holds_max = 250,
         ship_fighters = LEAST(ship_fighters, 40),
         ship_shields = LEAST(ship_shields, 1000)
       WHERE id = $2`,
      [LINER_SHIP_TYPE, player.id]
    );
    await markClaimed(client, derelict.id, player.id);
    await client.query('COMMIT');
    return {
      success: true,
      message: 'You claim the liner and swap into her. She is yours, captain.',
    };
  }

  // Default for liners: sell for the flat bounty.
  await client.query(`UPDATE players SET credits = credits + $1 WHERE id = $2`, [
    LINER_FLAT_BOUNTY,
    player.id,
  ]);
  await markClaimed(client, derelict.id, player.id);
  await client.query('COMMIT');

  try {
    await broadcastTNN(
      player.universe_id,
      'Liner Claimed',
      `A drifting liner near Sector ${derelict.sector_number} has been claimed and sold for ${LINER_FLAT_BOUNTY} credits.`
    );
  } catch {
    // Best effort.
  }

  return {
    success: true,
    message: `Liner claimed and sold for a flat ${LINER_FLAT_BOUNTY} credits.`,
    loot: { fuel: 0, organics: 0, equipment: 0, credits: LINER_FLAT_BOUNTY },
  };
};
