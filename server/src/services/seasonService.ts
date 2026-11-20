import { pool, query } from '../db/connection';
import { broadcastTNN } from './broadcastService';
import { getTheme, TITLE_LABELS, TitleKey } from './seasonThemes';

// Seasons: timed competitive chapters in one persistent universe.
// Nothing resets between chapters. Since migration 041 a chapter can
// carry a theme (services/seasonThemes.ts) and is scored on what each
// player gains during it ('gain' scoring), measured against a snapshot
// taken at the start (season_baselines). Season 1 predates that and
// keeps 'networth' scoring. The season tick warns
// players through TNN before a season ends, then archives the final
// standings to the Hall of Fame.
//
// Fairness rules, enforced here:
// - Warnings always precede the end: 7 days, 24 hours and 1 hour out.
// - Ending a season is read only on player data. Nothing is reset,
//   taken or destroyed; the standings are copied, not moved.

export type SeasonStatus = 'active' | 'ended';
export type SeasonScoring = 'networth' | 'gain';

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
  theme: string | null;
  themeName: string | null;
  scoring: SeasonScoring;
}

export interface SeasonTitle {
  titleKey: string;
  titleLabel: string;
  playerId: number | null;
  username: string | null;
  corpName: string;
  value: number;
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
  gain: number | null;
}

export const WARNING_HOURS = [168, 24, 1];
export const MIN_SEASON_DAYS = 1;
export const MAX_SEASON_DAYS = 365;
const STANDINGS_TO_ARCHIVE = 100;
const UNDEFINED_TABLE = '42P01';
const UNIQUE_VIOLATION = '23505';
const UNDEFINED_COLUMN = '42703';

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
  theme: row.theme ?? null,
  themeName: getTheme(row.theme)?.name ?? null,
  scoring: row.scoring === 'gain' ? 'gain' : 'networth',
});

const toTitle = (row: any): SeasonTitle => ({
  titleKey: row.title_key,
  titleLabel: row.title_label,
  playerId: row.player_id,
  username: row.username,
  corpName: row.corp_name,
  value: Number(row.value),
});

/**
 * Net worth of player alias p (bank account alias ba), the same
 * formula as /api/leaderboard.
 */
const NETWORTH_SQL = `(
  p.credits +
  COALESCE(ba.balance, 0) +
  (p.cargo_fuel * 10) +
  (p.cargo_organics * 5) +
  (p.cargo_equipment * 15) +
  (p.ship_fighters * 100) +
  (p.ship_shields * 50) +
  (SELECT COALESCE(SUM(pl.fuel * 10 + pl.organics * 5 + pl.equipment * 15 + pl.credits), 0)
   FROM planets pl WHERE pl.owner_id = p.id)
)`;

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
  gain: row.gain === null || row.gain === undefined ? null : Number(row.gain),
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
): Promise<Array<{ season: Season; standings: SeasonStanding[]; titles: SeasonTitle[] }>> => {
  const seasons = (await listSeasons(universeId)).filter((s) => s.status === 'ended');
  const out = [];
  for (const season of seasons) {
    out.push({
      season,
      standings: await getStandings(season.id, perSeason),
      titles: await getTitles(season.id),
    });
  }
  return out;
};

/**
 * Titles awarded at the end of a chapter (empty before migration 041).
 */
export const getTitles = async (seasonId: number): Promise<SeasonTitle[]> => {
  try {
    const result = await query(
      `SELECT * FROM season_titles WHERE season_id = $1 ORDER BY id ASC`,
      [seasonId]
    );
    return result.rows.map(toTitle);
  } catch (error: any) {
    if (isMissingTable(error)) return [];
    throw error;
  }
};

/**
 * Snapshot every player in the season's universe who has no baseline
 * yet: everyone at chapter start, then late joiners afterwards.
 * Read only on player data.
 */
export const snapshotBaselines = async (
  db: { query: (text: string, params?: any[]) => Promise<any> },
  seasonId: number,
  universeId: number
): Promise<number> => {
  const result = await db.query(
    `INSERT INTO season_baselines (season_id, player_id, networth, bounty_credits, bounties_claimed, kills)
     SELECT $1, p.id, ${NETWORTH_SQL},
            COALESCE(bh.bounty_credits_earned, 0), COALESCE(bh.bounties_claimed, 0), COALESCE(p.kills, 0)
     FROM players p
     LEFT JOIN bank_accounts ba ON ba.player_id = p.id AND ba.account_type = 'personal'
     LEFT JOIN bounty_hunters bh ON bh.player_id = p.id
     WHERE p.universe_id = $2
     ON CONFLICT (season_id, player_id) DO NOTHING`,
    [seasonId, universeId]
  );
  return result.rowCount || 0;
};

/**
 * Snapshot a newly created player into the running gain season of its
 * universe, if any. Best effort; the season tick catches anything missed.
 */
export const snapshotNewPlayer = async (universeId: number): Promise<void> => {
  try {
    const season = await getActiveSeason(universeId);
    if (season && season.scoring === 'gain') {
      await snapshotBaselines(pool, season.id, universeId);
    }
  } catch (error) {
    console.error('[Seasons] Could not snapshot new player:', error);
  }
};

export interface LiveGain {
  playerId: number;
  corpName: string;
  username: string;
  networth: number;
  gain: number;
}

export interface TitleRace {
  titleKey: string;
  titleLabel: string;
  leaders: Array<{ playerId: number; corpName: string; username: string; value: number }>;
}

/**
 * Live view of a running chapter: the top players by net worth gain
 * so far, and the race for each of the theme's titles.
 */
export const getLiveStandings = async (
  season: Season,
  limit: number = 10
): Promise<{ gains: LiveGain[]; titleRaces: TitleRace[] }> => {
  if (season.scoring !== 'gain') return { gains: [], titleRaces: [] };
  try {
    const gainsRes = await query(
      `SELECT scored.* FROM (
         SELECT p.id, p.corp_name, u.username, ${NETWORTH_SQL} AS networth,
                ${NETWORTH_SQL} - COALESCE(b.networth, ${NETWORTH_SQL}) AS gain
         FROM players p
         JOIN users u ON u.id = p.user_id
         LEFT JOIN bank_accounts ba ON ba.player_id = p.id AND ba.account_type = 'personal'
         LEFT JOIN season_baselines b ON b.season_id = $1 AND b.player_id = p.id
         WHERE p.universe_id = $2 AND p.is_alive = true
       ) scored
       ORDER BY scored.gain DESC, scored.networth DESC, scored.id ASC
       LIMIT $3`,
      [season.id, season.universeId, limit]
    );
    const titleRaces: TitleRace[] = [];
    for (const key of getTheme(season.theme)?.titles || []) {
      const rows = await titleLeaders(pool, season, key, 5);
      titleRaces.push({
        titleKey: key,
        titleLabel: TITLE_LABELS[key],
        leaders: rows.map((r: any) => ({
          playerId: r.id,
          corpName: r.corp_name,
          username: r.username,
          value: Number(r.value),
        })),
      });
    }
    return {
      gains: gainsRes.rows.map((r: any) => ({
        playerId: r.id,
        corpName: r.corp_name,
        username: r.username,
        networth: Number(r.networth),
        gain: Number(r.gain),
      })),
      titleRaces,
    };
  } catch (error: any) {
    if (isMissingTable(error)) return { gains: [], titleRaces: [] };
    throw error;
  }
};

/**
 * Leaders for one title, best first. Only positive values count.
 * Top Bounty Hunter: bounty credits earned during the chapter (lifetime
 * earnings minus the snapshot), ties broken by bounties claimed in the
 * chapter, then by the archived gain standings.
 */
const titleLeaders = async (db: any, season: Season, key: TitleKey, limit: number): Promise<any[]> => {
  if (key === 'top_bounty_hunter') {
    const result = await db.query(
      `SELECT p.id, p.corp_name, u.username,
              bh.bounty_credits_earned - COALESCE(b.bounty_credits, 0) AS value,
              bh.bounties_claimed - COALESCE(b.bounties_claimed, 0) AS claimed
       FROM bounty_hunters bh
       JOIN players p ON p.id = bh.player_id
       JOIN users u ON u.id = p.user_id
       LEFT JOIN season_baselines b ON b.season_id = $1 AND b.player_id = p.id
       LEFT JOIN season_standings ss ON ss.season_id = $1 AND ss.player_id = p.id
       WHERE p.universe_id = $2
         AND bh.bounty_credits_earned - COALESCE(b.bounty_credits, 0) > 0
       ORDER BY value DESC, claimed DESC, ss.rank ASC NULLS LAST, p.id ASC
       LIMIT $3`,
      [season.id, season.universeId, limit]
    );
    return result.rows;
  }
  return [];
};

/**
 * Award the theme's titles at chapter end, inside the end transaction.
 */
const awardTitles = async (client: any, season: Season): Promise<SeasonTitle[]> => {
  const awarded: SeasonTitle[] = [];
  for (const key of getTheme(season.theme)?.titles || []) {
    const [winner] = await titleLeaders(client, season, key, 1);
    if (!winner) continue;
    const result = await client.query(
      `INSERT INTO season_titles (season_id, title_key, title_label, player_id, username, corp_name, value)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (season_id, title_key) DO NOTHING
       RETURNING *`,
      [season.id, key, TITLE_LABELS[key], winner.id, winner.username, winner.corp_name, winner.value]
    );
    if (result.rows.length > 0) awarded.push(toTitle(result.rows[0]));
  }
  return awarded;
};

/**
 * Start a new season in a universe. Fails if one is already running.
 */
export const startSeason = async (
  universeId: number,
  durationDays: number,
  name?: string,
  themeKey?: string | null
): Promise<{ success: boolean; message: string; season?: Season }> => {
  const theme = themeKey ? getTheme(themeKey) : null;
  if (themeKey && !theme) {
    return { success: false, message: `Unknown season theme: ${themeKey}` };
  }
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
    const seasonName =
      (name || '').trim().slice(0, 100) ||
      (theme ? `Season ${seasonNumber}: ${theme.name}` : `Season ${seasonNumber}`);
    // Chapters score on gains made during the chapter, measured
    // against a snapshot of every player taken right now.
    const result = await client.query(
      `INSERT INTO seasons (universe_id, season_number, name, status, starts_at, ends_at, theme, scoring)
       VALUES ($1, $2, $3, 'active', NOW(), NOW() + make_interval(secs => $4::double precision), $5, 'gain')
       RETURNING *`,
      [universeId, seasonNumber, seasonName, Math.round(durationDays * 24 * 3600), theme ? theme.key : null]
    );
    season = toSeason(result.rows[0]);
    await snapshotBaselines(client, season.id, universeId);
    await client.query('COMMIT');
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error?.code === UNIQUE_VIOLATION) {
      return { success: false, message: 'A season is already running in this universe' };
    }
    if (isMissingTable(error)) {
      return { success: false, message: 'Seasons are not set up yet (migrations 034 and 041 must be applied)' };
    }
    if (error?.code === UNDEFINED_COLUMN) {
      return { success: false, message: 'Season chapters are not set up yet (migration 041 not applied)' };
    }
    throw error;
  } finally {
    client.release();
  }

  await broadcastTNN(
    universeId,
    `${season.name} has begun`,
    `${season.name} is now under way and runs for ${describeHours(Math.round(durationDays * 24))}. ` +
      (theme ? `${theme.blurb} ` : '') +
      `Standings score the net worth you gain during the season, so every pilot starts level. ` +
      `Nothing resets: your ship, cargo, credits and planets carry on as normal.`
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
  if (season.scoring === 'gain') return archiveGainStandings(client, season);
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
 * Gain scoring: rank by net worth gained since the chapter snapshot.
 * A player with no snapshot counts as zero gain. Ties fall back to
 * total net worth.
 */
const archiveGainStandings = async (client: any, season: Season): Promise<number> => {
  const result = await client.query(
    `INSERT INTO season_standings
       (season_id, player_id, rank, username, corp_name, ship_type, networth, experience, kills, deaths, planet_count, gain)
     SELECT $1, ranked.id, ranked.rank, ranked.username, ranked.corp_name, ranked.ship_type,
            ranked.networth, ranked.experience, ranked.kills, ranked.deaths, ranked.planet_count, ranked.gain
     FROM (
       SELECT scored.*,
              ROW_NUMBER() OVER (ORDER BY scored.gain DESC, scored.networth DESC, scored.experience DESC, scored.id ASC) AS rank
       FROM (
         SELECT
           p.id,
           u.username,
           p.corp_name,
           p.ship_type,
           ${NETWORTH_SQL} AS networth,
           ${NETWORTH_SQL} - COALESCE(b.networth, ${NETWORTH_SQL}) AS gain,
           COALESCE(p.experience, 0) AS experience,
           COALESCE(p.kills, 0) AS kills,
           COALESCE(p.deaths, 0) AS deaths,
           (SELECT COUNT(*) FROM planets WHERE owner_id = p.id) AS planet_count
         FROM players p
         JOIN users u ON p.user_id = u.id
         LEFT JOIN bank_accounts ba ON ba.player_id = p.id AND ba.account_type = 'personal'
         LEFT JOIN season_baselines b ON b.season_id = $1 AND b.player_id = p.id
         WHERE p.universe_id = $2 AND p.is_alive = true
       ) scored
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
): Promise<{ success: boolean; message: string; season?: Season; standings?: SeasonStanding[]; titles?: SeasonTitle[] }> => {
  const client = await pool.connect();
  let season: Season;
  let titles: SeasonTitle[] = [];
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
    titles = await awardTitles(client, season);
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
  const titleLines = (getTheme(season.theme)?.titles || [])
    .map((key) => {
      const won = titles.find((t) => t.titleKey === key);
      return won
        ? ` ${TITLE_LABELS[key]}: ${won.corpName} with ${won.value.toLocaleString()} bounty credits.`
        : ` Nobody earned the ${TITLE_LABELS[key]} title this season.`;
    })
    .join('');
  await broadcastTNN(
    season.universeId,
    `${season.name} has ended`,
    `${season.name} is over. Final standings${season.scoring === 'gain' ? ' by net worth gained' : ''}: ${podium}.${titleLines} ` +
      `See the Hall of Fame on the leaderboard. Your ship, cargo, credits and planets are untouched.`
  );
  return { success: true, message: `${season.name} ended`, season, standings, titles };
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
      if (season.scoring === 'gain') {
        // Late joiners get their snapshot here if createPlayer missed it.
        await snapshotBaselines(pool, season.id, season.universeId);
      }
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
              `(${new Date(season.endsAt).toUTCString()}). Final standings by net worth${season.scoring === 'gain' ? ' gained' : ''} go into the Hall of Fame. ` +
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
