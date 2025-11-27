-- Migration: Add broadcast deletion tracking per player
-- Broadcasts are shared, so we need a separate table to track which players have deleted them

CREATE TABLE IF NOT EXISTS message_deletions (
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, message_id)
);

CREATE INDEX idx_message_deletions_player ON message_deletions(player_id);
CREATE INDEX idx_message_deletions_message ON message_deletions(message_id);
