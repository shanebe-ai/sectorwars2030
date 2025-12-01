-- Migration 013: Beacon System
-- Personal beacons with messages that float in sectors

CREATE TABLE IF NOT EXISTS sector_beacons (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  owner_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  owner_name VARCHAR(100) NOT NULL, -- Cached for display after player deletion
  message VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sector_beacons_universe ON sector_beacons(universe_id);
CREATE INDEX IF NOT EXISTS idx_sector_beacons_sector ON sector_beacons(universe_id, sector_number);
CREATE INDEX IF NOT EXISTS idx_sector_beacons_owner ON sector_beacons(owner_id);

-- Add beacon inventory to players
ALTER TABLE players ADD COLUMN IF NOT EXISTS ship_beacons INTEGER DEFAULT 0;

-- Beacon price constant (will be used in code: 500 credits per beacon)
COMMENT ON TABLE sector_beacons IS 'Personal beacons with messages floating in sectors';
COMMENT ON COLUMN sector_beacons.message IS 'Max 255 characters, shown to anyone entering sector';

