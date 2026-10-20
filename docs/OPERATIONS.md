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
  For a clean slate next season, create a new universe and start Season 1
  there; the old universe and its Hall of Fame stay.
* Players see the season and countdown in RANKINGS (plus a Hall of Fame tab)
  and with the `season` command in BBS mode.

API:

* `GET /api/seasons/universe/:universeId` current season, history, Hall of Fame
* `GET /api/seasons/:seasonId/standings` archived final standings
* `POST /api/seasons/admin/start` `{ universeId, durationDays, name? }` (admin)
* `POST /api/seasons/admin/:id/extend` `{ days }` (admin)
* `POST /api/seasons/admin/:id/end` (admin)
