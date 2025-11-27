-- ============================================================================
-- PER-USER READ TRACKING FOR BROADCASTS/CORPORATE
-- Migration 006: Track which players have "read" shared messages
-- ============================================================================

-- Track per-user read status for broadcasts and corporate messages
CREATE TABLE IF NOT EXISTS message_reads (
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_message_reads_player ON message_reads(player_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_message ON message_reads(message_id);

COMMENT ON TABLE message_reads IS 'Tracks per-user read status for BROADCAST and CORPORATE messages (shared messages need individual tracking)';

