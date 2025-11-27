-- ============================================================================
-- CORPORATE MESSAGING SYSTEM
-- Migration 005: Add corporate message type for alliance chat
-- ============================================================================

-- Update message_type constraint to include CORPORATE
ALTER TABLE messages
DROP CONSTRAINT IF EXISTS messages_message_type_check;

ALTER TABLE messages
ADD CONSTRAINT messages_message_type_check 
CHECK (message_type IN ('DIRECT', 'BROADCAST', 'CORPORATE'));

-- Add corp_id to messages for corporate messages (optional, for faster lookups)
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS corp_id INTEGER REFERENCES corporations(id) ON DELETE CASCADE;

-- Index for corporate messages
CREATE INDEX IF NOT EXISTS idx_messages_corporate ON messages(corp_id, message_type) WHERE message_type = 'CORPORATE';

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN messages.message_type IS 'Message type: DIRECT (player-to-player), BROADCAST (universe-wide), or CORPORATE (alliance chat)';
COMMENT ON COLUMN messages.corp_id IS 'Corporation ID for CORPORATE messages (enables efficient filtering)';

