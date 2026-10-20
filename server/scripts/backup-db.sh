#!/usr/bin/env bash
# Nightly PostgreSQL backup for the game database.
#
# Run on the server by .github/workflows/backup.yml (or by hand):
#   bash /home/tradewars/server/scripts/backup-db.sh
#
# Reads connection settings from server/.env (DATABASE_URL or DB_*),
# writes a compressed custom format dump, checks it can be read back,
# and keeps the newest KEEP_DAYS days of dumps. Read only on the
# database: it never changes game data.
#
# Restore (stop the server first, see docs/OPERATIONS.md):
#   pg_restore --clean --if-exists -d <db> <dump file>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tradewars}"
KEEP_DAYS="${KEEP_DAYS:-14}"

# Read one KEY=value from the .env file without executing it.
env_value() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  grep -E "^[[:space:]]*${key}=" "$ENV_FILE" | tail -n 1 | sed -E "s/^[[:space:]]*${key}=//; s/^['\"]//; s/['\"][[:space:]]*$//" || true
}

DATABASE_URL="${DATABASE_URL:-$(env_value DATABASE_URL)}"
DB_HOST="${DB_HOST:-$(env_value DB_HOST)}"
DB_PORT="${DB_PORT:-$(env_value DB_PORT)}"
DB_NAME="${DB_NAME:-$(env_value DB_NAME)}"
DB_USER="${DB_USER:-$(env_value DB_USER)}"
DB_PASSWORD="${DB_PASSWORD:-$(env_value DB_PASSWORD)}"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-tradewars}"
DB_USER="${DB_USER:-postgres}"

for tool in pg_dump pg_restore; do
  command -v "$tool" >/dev/null 2>&1 || { echo "ERROR: $tool not found"; exit 1; }
done

# Fall back to the home folder if /var/backups is not writable.
if ! mkdir -p "$BACKUP_DIR" 2>/dev/null || [ ! -w "$BACKUP_DIR" ]; then
  BACKUP_DIR="$HOME/backups/tradewars"
  mkdir -p "$BACKUP_DIR"
fi
chmod 700 "$BACKUP_DIR"
umask 077

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/${DB_NAME}_${STAMP}.dump"
TMP="$OUT.partial"
trap 'rm -f "$TMP"' EXIT

echo "Backing up database $DB_NAME to $OUT"

dump_ok=0
if [ -n "$DATABASE_URL" ]; then
  pg_dump --format=custom --no-owner --file="$TMP" "$DATABASE_URL" && dump_ok=1
else
  PGPASSWORD="$DB_PASSWORD" pg_dump --format=custom --no-owner \
    --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
    --file="$TMP" "$DB_NAME" && dump_ok=1
fi

# Fallback for a local database with peer auth: dump as the postgres
# OS user over the unix socket.
if [ "$dump_ok" -ne 1 ] && [ "$(id -u)" -eq 0 ] && id postgres >/dev/null 2>&1; then
  echo "Password login failed, retrying as the postgres system user"
  runuser -u postgres -- pg_dump --format=custom --no-owner "$DB_NAME" > "$TMP" && dump_ok=1
fi

if [ "$dump_ok" -ne 1 ]; then
  echo "ERROR: pg_dump failed"
  exit 1
fi

# A dump that pg_restore cannot list is no backup at all.
if ! pg_restore --list "$TMP" >/dev/null; then
  echo "ERROR: dump failed verification"
  exit 1
fi
TABLES="$(pg_restore --list "$TMP" | grep -c ' TABLE DATA ' || true)"

mv "$TMP" "$OUT"
trap - EXIT

find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}_*.dump" -type f -mtime +"$KEEP_DAYS" -print -delete

echo "Backup OK: $(du -h "$OUT" | cut -f1), $TABLES tables"
echo "Backups kept in $BACKUP_DIR:"
ls -1t "$BACKUP_DIR"/"${DB_NAME}"_*.dump | head -n 20
echo "Disk free on backup volume: $(df -h "$BACKUP_DIR" | awk 'NR==2 {print $4}')"
