-- Migration 022: Fix alien_ships schema to match service requirements
-- Description: Adds missing columns needed for alien trading system
-- Date: 2025-12-18

-- Add missing columns to alien_ships table
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS ship_name VARCHAR(100);
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS current_sector INTEGER;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 50000;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS cargo_fuel INTEGER DEFAULT 0;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS cargo_organics INTEGER DEFAULT 0;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS cargo_equipment INTEGER DEFAULT 0;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS alignment INTEGER DEFAULT -200;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS kills INTEGER DEFAULT 0;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS home_sector INTEGER;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS last_move_at TIMESTAMP DEFAULT NOW();
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMP DEFAULT NOW();

-- Populate current_sector from sector_number for existing rows
UPDATE alien_ships SET current_sector = sector_number WHERE current_sector IS NULL;

-- Generate ship names for existing aliens (if any)
UPDATE alien_ships
SET ship_name = alien_race || ' Vessel #' || id
WHERE ship_name IS NULL;

-- Add index for current_sector lookups
CREATE INDEX IF NOT EXISTS idx_alien_ships_current_sector ON alien_ships(universe_id, current_sector);
CREATE INDEX IF NOT EXISTS idx_alien_ships_behavior ON alien_ships(behavior);

COMMENT ON COLUMN alien_ships.cargo_fuel IS 'Fuel cargo alien is carrying for trading';
COMMENT ON COLUMN alien_ships.cargo_organics IS 'Organics cargo alien is carrying for trading';
COMMENT ON COLUMN alien_ships.cargo_equipment IS 'Equipment cargo alien is carrying for trading';
COMMENT ON COLUMN alien_ships.alignment IS 'Alien alignment: -1000 (hostile) to +1000 (friendly), affects trade pricing';
COMMENT ON COLUMN alien_ships.credits IS 'Credits the alien has accumulated through trading';
COMMENT ON COLUMN alien_ships.current_sector IS 'Current sector location (may differ from sector_number after movement)';
