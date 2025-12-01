-- Migration 012: Floating Cargo System
-- Cargo that floats in space after combat when winner can't hold it all

CREATE TABLE IF NOT EXISTS sector_cargo (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  fuel INTEGER DEFAULT 0,
  organics INTEGER DEFAULT 0,
  equipment INTEGER DEFAULT 0,
  colonists INTEGER DEFAULT 0,
  source_event VARCHAR(50), -- 'combat', 'jettison', 'wreckage'
  source_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_sector_cargo_universe ON sector_cargo(universe_id);
CREATE INDEX IF NOT EXISTS idx_sector_cargo_sector ON sector_cargo(universe_id, sector_number);
CREATE INDEX IF NOT EXISTS idx_sector_cargo_expires ON sector_cargo(expires_at);

COMMENT ON TABLE sector_cargo IS 'Floating cargo in sectors - from combat, jettison, etc.';
COMMENT ON COLUMN sector_cargo.expires_at IS 'Cargo despawns after 24 hours';

