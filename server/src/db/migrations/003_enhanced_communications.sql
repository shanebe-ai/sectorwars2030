-- ============================================================================
-- ENHANCED COMMUNICATIONS SYSTEM
-- Migration 003: Known Traders & Universe Broadcasts
-- ============================================================================

-- Add message_type column to messages table
ALTER TABLE messages
ADD COLUMN message_type VARCHAR(20) DEFAULT 'DIRECT' CHECK (message_type IN ('DIRECT', 'BROADCAST'));

-- Make recipient_id nullable for broadcast messages
ALTER TABLE messages
ALTER COLUMN recipient_id DROP NOT NULL;

-- Update index for broadcasts (where recipient_id is NULL)
CREATE INDEX idx_messages_broadcast ON messages(universe_id, message_type) WHERE message_type = 'BROADCAST';

-- ============================================================================
-- PLAYER ENCOUNTERS (Known Traders)
-- ============================================================================

CREATE TABLE player_encounters (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  encountered_player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  first_met_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_met_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  encounter_count INTEGER DEFAULT 1,
  UNIQUE(player_id, encountered_player_id, universe_id)
);

CREATE INDEX idx_encounters_player ON player_encounters(player_id);
CREATE INDEX idx_encounters_universe ON player_encounters(universe_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN messages.message_type IS 'Message type: DIRECT (player-to-player) or BROADCAST (universe-wide)';
COMMENT ON COLUMN messages.recipient_id IS 'Recipient player ID (NULL for broadcasts)';
COMMENT ON TABLE player_encounters IS 'Tracks which players have met in sectors (enables messaging known traders)';
COMMENT ON COLUMN player_encounters.encounter_count IS 'Number of times these players have been in the same sector';
