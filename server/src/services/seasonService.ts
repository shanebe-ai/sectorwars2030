import { pool, query } from '../db/connection';
import { broadcastTNN } from './broadcastService';

// Seasons: timed competitive runs in a universe. The season tick warns
// players through TNN before a season ends, then archives the final
// standings to the Hall of Fame.
//
// Fairness rules, enforced here:
// - Warnings always precede the end: 7 days, 24 hours and 1 hour out.
// - Ending a season is read only on player data. Nothing is reset,
//   taken or destroyed; the standings are copied, not moved.

export type SeasonStatus = 'active' | 'ended';

export interface Season {
  id: number;
  universeId: number;
  seasonNumber: number;
  name: string;
  status: SeasonStatus;
  startsAt: string;
  endsAt: string;
  endedAt: string | null;
  lastWarningHours: number | null;
}

export interface SeasonStanding {
  rank: number;
  playerId: number | null;
  username: string | null;
  corpName: string;
  shipType: string | null;
  networth: number;
  experience: number;
  kills: number;
  deaths: number;
  planetCount: number;
}

export const WARNING_HOURS = [168, 24, 1];
export const MIN_SEASON_DAYS = 1;
export const MAX_SEASON_DAYS = 365;
const STANDINGS_TO_ARCHIVE = 100;
const UNDEFINED_TABLE = '42P01';
const UNIQUE_VIOLATION = '23505';

const HOUR_MS = 60 * 60 * 1000;

const toSeason = (row: any): Season => ({
  id: row.id,
  universeId: row.universe_id,
  seasonNumber: row.season_number,
  name: row.name,
  status: row.status,
  startsAt: row.starts_at,
  endsAt: row.ends_at,
  endedAt: row.ended_at,
  lastWarningHours: row.last_warning_hours,
});

const toStanding = (row: any): SeasonStanding => ({
  rank: row.rank,
  playerId: row.player_id,
  username: row.username,
  corpName: row.corp_name,
  shipType: row.ship_type,
  networth: Number(row.networth),
  experience: Number(row.experience),
  kills: row.kills,
  deaths: row.deaths,
  planetCount: row.planet_count,
});

const isMissingTable = (error: any) => error?.code === UNDEFINED_TABLE;

/**
 * Human friendly time left, e.g. "7 days", "24 hours", "1 hour".
 */
export const describeHours = (hours: number): string => {
  if (hours >= 48 && hours % 24 === 0) return `${hours / 24} days`;
  return hours === 1 ? '1 hour' : `${hours} hours`;
};

/**
 * The tightest warning threshold that is due and has not been sent yet,
 * or null. Only one warning goes out per tick, so a season started with
 * 20 hours left gets the 24 hour warning, not the 7 day one as well.
 */
export const dueWarning = (
  hoursLeft: number,
  lastWarningHours: number | null
): number | null => {
  if (hoursLeft <= 0) return null;
  const due = WARNING_HOURS.filter(
    (h) => hoursLeft <= h && (lastWarningHours === null || h < lastWarningHours)
  );
  return due.length > 0 ? Math.min(...due) : null;
};

/**
 * Whether the seasons tables exist yet (migration 034 applied).
 */
export const seasonsAvailable = async (): Promise<boolean> => {
  const result = await query(`SELECT to_regclass('public.seasons') IS NOT NULL AS ok`);
  return result.rows[0]?.ok === true;
};

export const getActiveSeason = async (universeId: number): Promise<Season | null> => {
  try {
    const result = await query(
      `SELECT * FROM seasons WHERE universe_id = $1 AND status = 'active' LIMIT 1`,
      [universeId]
    );
    return result.rows.length > 0 ? toSeason(result.rows[0]) : null;
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
};

export const listSeasons = async (universeId: number): Promise<Season[]> => {
  try {
    const result = await query(
      `SELECT * FROM seasons WHERE universe_id = $1 ORDER BY season_number DESC`,
      [universeId]
    );
    return result.rows.map(toSeason);
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
};

export const getSeason = async (seasonId: number): Promise<Season | null> => {
  try {
    const result = await query(`SELECT * FROM seasons WHERE id = $1`, [seasonId]);
    return result.rows.length > 0 ? toSeason(result.rows[0]) : null;
  } catch (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
};

export const getStandings = async (
  seasonId: number,
  limit: number = STANDINGS_TO_ARCHIVE
): Promise<SeasonStanding[]> => {
  try {
    const result = await query(
      `SELECT * FROM season_standings WHERE season_id = $1 ORDER BY rank ASC LIMIT $2`,
      [seasonId, limit]
    );
    return result.rows.map(toStanding);
  } catch (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
};

/**
 * Hall of Fame: the top finishers of every ended season in a universe.
 */
export const getHallOfFame = async (
  universeId: number,
  perSeason: number = 3
): Promise<Array<{ season: Season; standings: SeasonStanding[] }>> => {
  const seasons = (await listSeasons(universeId)).filter((s) => s.status === 'ended');
  const out = [];
  for (const season of seasons) {
    out.push({ season, standings: await getStandings(season.id, perSeason) });
  }
  return out;
};

/**
 * Start a new season in a universe. Fails if one is already running.
 */
export const startSeason = async (
  universeId: number,
  durationDays: number,
  name?: string
): Promise<{ success: boolean; message: string; season?: Season }> => {
  if (!Number.isFinite(durationDays) || durationDays < MIN_SEASON_DAYS || durationDays > MAX_SEASON_DAYS) {
    return { success: false, message: `Season length must be between ${MIN_SEASON_DAYS} and ${MAX_SEASON_DAYS} days` };
  }

  const universe = await query('SELECT id FROM universes WHERE id = $1', [universeId]);
  if (universe.rows.length === 0) {
    return { success: false, message: 'Universe not found' };
  }

  const client = await pool.connect();
  let season: Season;
  try {
    await client.query('BEGIN');
    const next = await client.query(
      `SELECT COALESCE(MAX(season_number), 0) + 1 AS n FROM seasons WHERE universe_id = $1`,
      [universeId]
    );
    const seasonNumber = next.rows[0].n;
    const seasonName = (name || '').trim().slice(0, 100) || `Season ${seasonNumber}`;
    const result = await client.query(
      `INSERT INTO seasons (universe_id, season_number, name, status, starts_at, ends_at)
       VALUES ($1, $2, $3, 'active', NOW(), NOW() + make_interval(secs => $4::double precision))
       RETURNING *`,
      [universeId, seasonNumber, seasonName, Math.round(durationDays * 24 * 3600)]
    );
    await client.query('COMMIT');
    season = toSeason(result.rows[0]);
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error?.code === UNIQUE_VIOLATION) {
      return { success: false, message: 'A season is already running in this universe' };
    }
    if (isMissingTable(error)) {
      return { success: false, message: 'Seasons are not set up yet (migration 034 not applied)' };
    }
    throw error;
  } finally {
    client.release();
  }

  await broadcastTNN(
    universeId,
    `${season.name} has begun`,
    `${season.name} is now under way and runs for ${describeHours(Math.round(durationDays * 24))}. ` +
      `Final standings by net worth go into the Hall of Fame when it ends. ` +
      `Your ship, cargo, credits and planets carry on as normal.`
  );
  return { success: true, message: `${season.name} started`, season };
};

/**
 * Push the end date of the running season back. Warnings start over so
 * players hear about the new end date.
 */
export const extendSeason = async (
  seasonId: number,
  extraDays: number
): Promise<{ success: boolean; message: string; season?: Season }> => {
  if (!Number.isFinite(extraDays) || extraDays <= 0 || extraDays > MAX_SEASON_DAYS) {
    return { success: false, message: `Extension must be between 0 and ${MAX_SEASON_DAYS} days` };
  }
  const result = await query(
    `UPDATE seasons
     SET ends_at = GREATEST(ends_at, NOW()) + make_interval(secs => $2::double precision), last_warning_hours = NULL
     WHERE id = $1 AND status = 'active'
     RETURNING *`,
    [seasonId, Math.round(extraDays * 24 * 3600)]
  );
  if (result.rows.length === 0) {
    return { success: false, message: 'No running season with that id' };
  }
  const season = toSeason(result.rows[0]);
  await broadcastTNN(
    season.universeId,
    `${season.name} extended`,
    `${season.name} has been extended by ${describeHours(Math.round(extraDays * 24))}. ` +
      `New end: ${new Date(season.endsAt).toUTCString()}.`
  );
  return { success: true, message: `${season.name} extended`, season };
};

/**
 * Copy the current standings by net worth into season_standings.
 * Uses the same net worth formula as /api/leaderboard. Read only on
 * players, planets and bank accounts.
 */
const archiveStandings = async (client: any, season: Season): Promise<number> => {
  const result = await client.query(
    `INSERT INTO season_standings
       (season_id, player_id, rank, username, corp_name, ship_type, networth, experience, kills, deaths, planet_count)
     SELECT $1, ranked.id, ranked.rank, ranked.username, ranked.corp_name, ranked.ship_type,
            ranked.networth, ranked.experience, ranked.kills, ranked.deaths, ranked.planet_count
     FROM (
       SELECT
         p.id,
         u.username,
         p.corp_name,
         p.ship_type,
         (
           p.credits +
           COALESCE(ba.balance, 0) +
           (p.cargo_fuel * 10) +
           (p.cargo_organics * 5) +
           (p.cargo_equipment * 15) +
           (p.ship_fighters * 100) +
           (p.ship_shields * 50) +
           (SELECT COALESCE(SUM(pl.fuel * 10 + pl.organics * 5 + pl.equipment * 15 + pl.credits), 0)
            FROM planets pl WHERE pl.owner_id = p.id)
         ) AS networth,
         COALESCE(p.experience, 0) AS experience,
         COALESCE(p.kills, 0) AS kills,
         COALESCE(p.deaths, 0) AS deaths,
         (SELECT COUNT(*) FROM planets WHERE owner_id = p.id) AS planet_count,
         ROW_NUMBER() OVER (
           ORDER BY (
             p.credits +
             COALESCE(ba.balance, 0) +
             (p.cargo_fuel * 10) +
             (p.cargo_organics * 5) +
             (p.cargo_equipment * 15) +
             (p.ship_fighters * 100) +
             (p.ship_shields * 50) +
             (SELECT COALESCE(SUM(pl.fuel * 10 + pl.organics * 5 + pl.equipment * 15 + pl.credits), 0)
              FROM planets pl WHERE pl.owner_id = p.id)
           ) DESC, p.experience DESC, p.id ASC
         ) AS rank
       FROM players p
       JOIN users u ON p.user_id = u.id
       LEFT JOIN bank_accounts ba ON ba.player_id = p.id AND ba.account_type = 'personal'
       WHERE p.universe_id = $2 AND p.is_alive = true
     ) ranked
     WHERE ranked.rank <= $3`,
    [season.id, season.universeId, STANDINGS_TO_ARCHIVE]
  );
  return result.rowCount || 0;
};

/**
 * End a running season: archive standings and announce the winners.
 * Safe to call twice; the second call finds no active season.
 */
export const endSeason = async (
  seasonId: number
): Promise<{ success: boolean; message: string; season?: Season; standings?: SeasonStanding[] }> => {
  const client = await pool.connect();
  let season: Season;
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT * FROM seasons WHERE id = $1 AND status = 'active' FOR UPDATE`,
      [seasonId]
    );
    if (locked.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'No running season with that id' };
    }
    season = toSeason(locked.rows[0]);
    await archiveStandings(client, season);
    const updated = await client.query(
      `UPDATE seasons SET status = 'ended', ended_at = NOW() WHERE id = $1 RETURNING *`,
      [seasonId]
    );
    season = toSeason(updated.rows[0]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const standings = await getStandings(season.id, 3);
  const podium = standings.length > 0
    ? standings.map((s) => `#${s.rank} ${s.corpName}`).join(', ')
    : 'No ranked traders this season';
  await broadcastTNN(
    season.universeId,
    `${season.name} has ended`,
    `${season.name} is over. Final standings: ${podium}. ` +
      `See the Hall of Fame on the leaderboard. Your ship, cargo, credits and planets are untouched.`
  );
  return { success: true, message: `${season.name} ended`, season, standings };
};

/**
 * One pass of the season clock: send due warnings, end expired seasons.
 */
export const runSeasonTick = async (now: Date = new Date()): Promise<void> => {
  let active: Season[];
  try {
    const result = await query(`SELECT * FROM seasons WHERE status = 'active'`);
    active = result.rows.map(toSeason);
  } catch (error) {
    if (isMissingTable(error)) return; // migration 034 not applied yet
    throw error;
  }

  for (const season of active) {
    try {
      const hoursLeft = (new Date(season.endsAt).getTime() - now.getTime()) / HOUR_MS;
      if (hoursLeft <= 0) {
        await endSeason(season.id);
        continue;
      }
      const warning = dueWarning(hoursLeft, season.lastWarningHours);
      if (warning !== null) {
        // Claim the warning first so two ticks can never both send it.
        const claimed = await query(
          `UPDATE seasons SET last_warning_hours = $2
           WHERE id = $1 AND status = 'active'
             AND (last_warning_hours IS NULL OR last_warning_hours > $2)
           RETURNING id`,
          [season.id, warning]
        );
        if (claimed.rows.length > 0) {
          await broadcastTNN(
            season.universeId,
            `${season.name} ends in ${describeHours(warning)}`,
            `${season.name} ends in about ${describeHours(warning)} ` +
              `(${new Date(season.endsAt).toUTCString()}). Final standings by net worth go into the Hall of Fame. ` +
              `Nothing is reset: your ship, cargo, credits and planets carry on.`
          );
        }
      }
    } catch (error) {
      console.error(`[Seasons] Tick error for season ${season.id}:`, error);
    }
  }
};

export const startSeasonTick = (intervalMs: number = 5 * 60 * 1000): NodeJS.Timeout => {
  console.log('[Seasons] Starting season tick every 5 minutes');

  runSeasonTick().catch((error) => {
    console.error('[Seasons] Tick error:', error);
  });

  return setInterval(() => {
    runSeasonTick().catch((error) => {
      console.error('[Seasons] Tick error:', error);
    });
  }, intervalMs);
};
