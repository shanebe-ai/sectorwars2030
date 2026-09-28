-- Migration 024: Add combat_log.notification_seen
--
-- playerController.ts reads and writes combat_log.notification_seen
-- (escape-pod notification flow), but no schema file or migration ever
-- created the column, so the notification endpoints failed at runtime
-- on a fresh database.

ALTER TABLE combat_log ADD COLUMN IF NOT EXISTS notification_seen BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_combat_log_notification ON combat_log(defender_id, notification_seen);

COMMENT ON COLUMN combat_log.notification_seen IS 'True once the defender has been notified of this combat event';
