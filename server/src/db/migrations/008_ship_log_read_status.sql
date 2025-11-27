-- ============================================================================
-- SHIP LOG READ STATUS
-- Migration 008: Add read/unread tracking for ship log entries
-- ============================================================================

-- Add is_read column to ship_logs table
ALTER TABLE ship_logs
ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;

-- Create index for quick unread count lookups
CREATE INDEX IF NOT EXISTS idx_ship_logs_unread ON ship_logs(player_id, is_read);

COMMENT ON COLUMN ship_logs.is_read IS 'TRUE when player has viewed the log entry';
