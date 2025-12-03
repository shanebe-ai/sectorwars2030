-- Update message_type constraint to support corporation-related messages
-- Adds 'corp_invite' for corporation invitations and 'inbox' for system notifications

-- Drop the existing constraint
ALTER TABLE messages
DROP CONSTRAINT IF EXISTS messages_message_type_check;

-- Add new constraint with expanded message types
ALTER TABLE messages
ADD CONSTRAINT messages_message_type_check
CHECK (message_type IN ('DIRECT', 'BROADCAST', 'CORPORATE', 'corp_invite', 'inbox'));

-- Update comment
COMMENT ON COLUMN messages.message_type IS 'Message type: DIRECT (player-to-player), BROADCAST (universe-wide), CORPORATE (alliance chat), corp_invite (corporation invitation), or inbox (system notification)';
