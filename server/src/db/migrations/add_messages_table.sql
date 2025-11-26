-- Migration: Add ship communications (messages) table
-- Run this on existing databases to add the messaging feature

-- ============================================================================
-- SHIP COMMUNICATIONS (Player Messages)
-- ============================================================================

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  recipient_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  sender_name VARCHAR(100), -- Cached for display after player deletion
  subject VARCHAR(200),
  body TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  is_deleted_by_sender BOOLEAN DEFAULT FALSE,
  is_deleted_by_recipient BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_universe ON messages(universe_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(recipient_id, is_read) WHERE is_read = FALSE;

