-- Migration 028: Living Economy tables
-- Description: Adds per-port economic state for the living economy feature.
-- Ports are stored on the sectors table, so economy state is keyed by sector.
-- Date: 2026-10-15

-- One row per sector that has a port, per commodity.
CREATE TABLE IF NOT EXISTS port_economy (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  commodity VARCHAR(20) NOT NULL CHECK (commodity IN ('fuel', 'organics', 'equipment')),
  volume_bought INTEGER DEFAULT 0,  -- units players bought from the port (rolling window)
  volume_sold INTEGER DEFAULT 0,    -- units players sold to the port (rolling window)
  drift NUMERIC(5, 4) DEFAULT 0,    -- price drift multiplier offset, bounded to [-0.4, 0.4]
  last_restock TIMESTAMP DEFAULT NOW(),
  event_state VARCHAR(20) DEFAULT 'none' CHECK (event_state IN ('none', 'scarcity', 'surplus')),
  event_ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(universe_id, sector_number, commodity)
);

CREATE INDEX IF NOT EXISTS idx_port_economy_sector ON port_economy(universe_id, sector_number);
CREATE INDEX IF NOT EXISTS idx_port_economy_event ON port_economy(event_state) WHERE event_state != 'none';

-- Backfill rows for existing ports so the economy starts at neutral.
INSERT INTO port_economy (universe_id, sector_number, commodity)
SELECT universe_id, sector_number, c.commodity
FROM sectors
CROSS JOIN (VALUES ('fuel'), ('organics'), ('equipment')) AS c(commodity)
WHERE port_type IS NOT NULL
ON CONFLICT (universe_id, sector_number, commodity) DO NOTHING;
