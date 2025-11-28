-- Migration 009: Add colonists column to players table for planet management
-- This allows players to buy and transport colonists to their planets

-- Add colonists column to players table
ALTER TABLE players
ADD COLUMN IF NOT EXISTS colonists INTEGER DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN players.colonists IS 'Number of colonists in ship cargo (transportable to planets)';

-- Ensure owner_name column exists on planets for direct owner name storage
ALTER TABLE planets
ADD COLUMN IF NOT EXISTS owner_name VARCHAR(100);

-- Update existing planets to have owner_name from player name
UPDATE planets p
SET owner_name = pl.name
FROM players pl
WHERE p.owner_id = pl.id AND p.owner_name IS NULL;

-- Ensure Earth has owner_name set to Terra Corp
UPDATE planets
SET owner_name = 'Terra Corp'
WHERE name = 'Earth' AND owner_name IS NULL;

