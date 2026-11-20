# Sector Wars 2030: Operations

Launch readiness notes for the production server (37.27.80.77).

## Rate limiting

All `/api` routes are rate limited per client IP. `/health` and Socket.io are not.

| Limiter  | Default                         | Env override                  |
|----------|---------------------------------|-------------------------------|
| Whole API | 300 requests per minute        | `RATE_LIMIT_API_PER_MINUTE`   |
| Login    | 20 failed logins per 15 minutes | `RATE_LIMIT_LOGIN_PER_15MIN`  |
| Register | 10 new accounts per hour        | `RATE_LIMIT_REGISTER_PER_HOUR`|

* Over the limit the API answers `429` with `Retry-After` and a friendly message.
* Successful logins never count toward the login limit.
* `RATE_LIMIT_DISABLED=true` turns it all off (emergency switch).
* Client IP: Express trusts `X-Forwarded-For` only from a proxy on the same
  machine (`TRUST_PROXY` defaults to `loopback`), so it works directly on
  :3000 today and behind nginx once HTTPS is set up, and clients cannot spoof
  their IP.
* Counters live in memory and reset when pm2 restarts the server.

## Database backups

`.github/workflows/backup.yml` runs every night at 07:17 UTC (about 3am
Toronto) and can be run by hand from the Actions tab ("Database backup", "Run
workflow"). It SSHes in with the deploy secrets and runs
`server/scripts/backup-db.sh`, which:

* reads the DB settings from `/home/tradewars/server/.env`,
* writes `/var/backups/tradewars/<db>_<UTC time>.dump` (pg_dump custom format, folder is root only),
* checks the dump can be read back with `pg_restore --list`,
* deletes dumps older than 14 days (`KEEP_DAYS`).

The backups stay on the same server. For protection against losing the whole
machine, copy them somewhere else too (for example a Hetzner Storage Box).

### Restore

```
pm2 stop tradewars-server
pg_restore --clean --if-exists --no-owner -d tradewars /var/backups/tradewars/<file>.dump
pm2 start tradewars-server
```

To check a backup without touching the live game, restore into a scratch
database first (`createdb tradewars_check`, restore into it, inspect, drop it).

## Seasons (migration 034)

Apply once with psql: `server/src/db/migrations/034_seasons.sql`. Until then
the season features stay hidden and nothing errors.

* Admin panel: each universe card has START SEASON, EXTEND and END NOW.
* TNN warns players 7 days, 24 hours and 1 hour before the end. Extending
  restarts the warnings.
* At the end the top 100 by net worth (same formula as the leaderboard) are
  copied into the Hall of Fame, and TNN announces the podium.
* Ending a season never resets or removes ships, cargo, credits or planets.
  The universe is one persistent world; each season is a chapter inside it
  (see Season chapters below).
* Players see the season and countdown in RANKINGS (plus a Hall of Fame tab)
  and with the `season` command in BBS mode.

API:

* `GET /api/seasons/universe/:universeId` current season, history, Hall of Fame
* `GET /api/seasons/:seasonId/standings` archived final standings
* `GET /api/seasons/themes` season themes an admin can pick
* `POST /api/seasons/admin/start` `{ universeId, durationDays, name?, theme? }` (admin)
* `POST /api/seasons/admin/:id/extend` `{ days }` (admin)
* `POST /api/seasons/admin/:id/end` (admin)

## Season chapters and themes (migration 041)

Apply once with psql: `server/src/db/migrations/041_season_chapters.sql`
(additive and safe to re run). Seasons are themed chapters of one long
lasting world. Nothing resets.

* Every season started after 041 scores on net worth gained during the
  season. A snapshot of every player is taken at the start
  (`season_baselines`); late joiners are snapshotted when they arrive.
  Season 1 keeps its original net worth scoring.
* Themes live in `server/src/services/seasonThemes.ts`. Pirate Season: pirate
  flotillas 30% and salvage fields 20% of seeded events (others 10% each),
  1.5 times the TerraCorp bonus on pirate kills, and a Top Bounty Hunter
  title (most bounty credits earned during the season, ties on bounties
  claimed). Seeding rate, the 2 event cap and TerraSpace safety are unchanged.
* Admin: pick the theme in the universe card before START SEASON.
* Players: RANKINGS has a This Season tab (gains plus the title race) and
  the Hall of Fame shows titles; the BBS `season` command shows both.
* Titles are archived in `season_titles` and announced by TNN at the end.
