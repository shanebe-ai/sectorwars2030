import { pool } from '../db/connection';

// Season themes.
//
// The universe is one persistent world; a season is a themed chapter
// inside it. A theme only reweights which dynamic events seed, scales
// a few payouts, and names the titles the chapter awards. It never
// resets or takes anything from players. Adding a chapter type (Gold
// Rush, Corporate War) is a new entry here.

export type TitleKey = 'top_bounty_hunter';

export interface SeasonTheme {
  key: string;
  name: string;
  // One line for TNN when the chapter starts.
  blurb: string;
  // Relative seeding weight per dynamic event type. Types left out
  // keep weight 1, so a theme only lists what it changes.
  eventWeights: Record<string, number>;
  // Multiplier on the TerraCorp bonus for flotilla pirate kills.
  pirateBountyMultiplier: number;
  titles: TitleKey[];
}

export const TITLE_LABELS: Record<TitleKey, string> = {
  top_bounty_hunter: 'Top Bounty Hunter',
};

export const SEASON_THEMES: Record<string, SeasonTheme> = {
  pirate_season: {
    key: 'pirate_season',
    name: 'Pirate Season',
    blurb:
      'Pirate flotillas and salvage fields turn up twice as often, TerraCorp pays 1.5 times the usual bonus ' +
      'for every pirate destroyed, and the pilot who earns the most bounty credits this season is crowned ' +
      'Top Bounty Hunter. TerraSpace stays safe, and every event still gives TNN warning first.',
    eventWeights: {
      pirate_flotilla: 3,
      salvage_field: 2,
    },
    pirateBountyMultiplier: 1.5,
    titles: ['top_bounty_hunter'],
  },
};

export const getTheme = (key: string | null | undefined): SeasonTheme | null =>
  (key && SEASON_THEMES[key]) || null;

export const listThemes = () =>
  Object.values(SEASON_THEMES).map((t) => ({ key: t.key, name: t.name, blurb: t.blurb, titles: t.titles }));

/**
 * The theme of the season running in a universe, or null for a classic
 * stretch. Runs on its own pooled query and swallows errors (for
 * example migration 041 not applied yet), so callers inside a
 * transaction never have it aborted by this lookup.
 */
export const getActiveTheme = async (universeId: number): Promise<SeasonTheme | null> => {
  try {
    const result = await pool.query(
      `SELECT theme FROM seasons WHERE universe_id = $1 AND status = 'active' LIMIT 1`,
      [universeId]
    );
    return getTheme(result.rows[0]?.theme);
  } catch {
    return null;
  }
};

/**
 * Weighted pick of an event type. `roll` is in [0, 1) and is injectable
 * for tests.
 */
export const pickWeightedType = <T extends string>(
  types: T[],
  theme: SeasonTheme | null,
  roll: number = Math.random()
): T => {
  const weights = types.map((t) => Math.max(0, theme?.eventWeights[t] ?? 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let target = roll * total;
  for (let i = 0; i < types.length; i++) {
    target -= weights[i];
    if (target < 0) return types[i];
  }
  return types[types.length - 1];
};
