import { AsyncLocalStorage } from 'async_hooks';

// Active player scoping.
//
// A user can own one player per universe. Since seasons start fresh
// universes, a returning user will own several players, and every
// "which ship is mine" lookup that filters players by user_id alone
// would match more than one row and silently act on an arbitrary one.
//
// The JWT carries the player the user picked (playerId). The auth
// middleware stores it, with the userId, in request scoped async
// storage, and activePlayerSql() turns it into an extra SQL condition
// that every user_id player lookup appends. New code that looks up the
// caller's player by user_id MUST append activePlayerSql().
//
// Tokens issued before the picker shipped have no playerId. For those
// the condition picks the user's newest player, which is the same
// player the client has always shown (it uses the first entry of
// GET /api/players, ordered newest first).
//
// Outside a request (ticks, tests calling services directly) there is
// no store and the condition is empty, so behaviour is unchanged.

export interface ActivePlayerContext {
  userId: number;
  playerId?: number | null;
}

const storage = new AsyncLocalStorage<ActivePlayerContext>();

export const runWithActivePlayer = <T>(ctx: ActivePlayerContext, fn: () => T): T =>
  storage.run(ctx, fn);

export const getActivePlayerContext = (): ActivePlayerContext | undefined => storage.getStore();

const safeInt = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

/**
 * SQL fragment, starting with " AND", that narrows a players lookup to
 * the caller's active player. Pass the table alias when the players
 * table is aliased (for example 'p'). Values are inlined only after
 * being checked as positive integers, so the fragment is injection safe
 * and needs no extra query parameters.
 */
export const activePlayerSql = (alias?: string): string => {
  const ctx = storage.getStore();
  if (!ctx) return '';
  const prefix = alias ? `${alias}.` : '';
  const playerId = safeInt(ctx.playerId);
  if (playerId !== null) return ` AND ${prefix}id = ${playerId}`;
  const userId = safeInt(ctx.userId);
  if (userId === null) return '';
  return (
    ` AND ${prefix}id = (SELECT newest.id FROM players newest WHERE newest.user_id = ${userId}` +
    ` ORDER BY newest.created_at DESC, newest.id DESC LIMIT 1)`
  );
};
