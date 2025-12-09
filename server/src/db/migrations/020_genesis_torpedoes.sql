-- Migration 020: Genesis Torpedoes
-- Adds genesis torpedo tracking to players table

-- Add genesis torpedo count to players (current inventory)
ALTER TABLE players
ADD COLUMN IF NOT EXISTS ship_genesis INTEGER NOT NULL DEFAULT 0;

-- Add check constraint to ensure non-negative genesis count
ALTER TABLE players
ADD CONSTRAINT players_ship_genesis_check CHECK (ship_genesis >= 0);

-- Note: ship_genesis_max already exists in ship_types table
-- No indexes needed - genesis count accessed with player queries
