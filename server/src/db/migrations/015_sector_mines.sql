-- Migration 015: Sector Mine Deployment System
-- Players can deploy mines in sectors that explode when non-corp members enter

CREATE TABLE IF NOT EXISTS sector_mines (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  owner_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  owner_name VARCHAR(100) NOT NULL, -- Cached for display
  mine_count INTEGER NOT NULL DEFAULT 0,
  deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(universe_id, sector_number, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_sector_mines_universe ON sector_mines(universe_id);
CREATE INDEX IF NOT EXISTS idx_sector_mines_sector ON sector_mines(universe_id, sector_number);
CREATE INDEX IF NOT EXISTS idx_sector_mines_owner ON sector_mines(owner_id);

COMMENT ON TABLE sector_mines IS 'Mines deployed in sectors that explode on non-corp member entry';
COMMENT ON COLUMN sector_mines.mine_count IS 'Number of mines deployed (max 5 per sector total)';

