-- Add corp_id to players table to link players to corporations
-- This allows players to be members of corporations

-- Add corp_id column to players table
ALTER TABLE players
ADD COLUMN corp_id INTEGER REFERENCES corporations(id) ON DELETE SET NULL;

-- Create index for corp_id lookups
CREATE INDEX idx_players_corp ON players(corp_id);

-- Update corp_name to be nullable since players may not be in a corp
ALTER TABLE players
ALTER COLUMN corp_name DROP NOT NULL;
