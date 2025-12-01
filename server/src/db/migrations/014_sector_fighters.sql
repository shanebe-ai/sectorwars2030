-- Migration 014: Sector Fighter Deployment System
-- Players can station fighters in sectors to defend territory

CREATE TABLE IF NOT EXISTS sector_fighters (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  owner_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  owner_name VARCHAR(100) NOT NULL, -- Cached for display
  fighter_count INTEGER NOT NULL DEFAULT 0,
  deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(universe_id, sector_number, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_sector_fighters_universe ON sector_fighters(universe_id);
CREATE INDEX IF NOT EXISTS idx_sector_fighters_sector ON sector_fighters(universe_id, sector_number);
CREATE INDEX IF NOT EXISTS idx_sector_fighters_owner ON sector_fighters(owner_id);

COMMENT ON TABLE sector_fighters IS 'Fighters stationed in sectors for territory defense';
COMMENT ON COLUMN sector_fighters.fighter_count IS 'Number of fighters deployed (max 500 per player per sector)';

