-- ============================================================================
-- SHIP LOG SYSTEM
-- Migration 007: Track player discoveries and manual notes
-- Persists across ship changes (tied to player, not ship)
-- ============================================================================

-- Log types: SOL, PLANET, PORT, DEAD_END, STARDOCK, MANUAL
CREATE TABLE IF NOT EXISTS ship_logs (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  log_type VARCHAR(20) NOT NULL CHECK (log_type IN ('SOL', 'PLANET', 'PORT', 'DEAD_END', 'STARDOCK', 'MANUAL')),
  port_type VARCHAR(20),           -- For PORT/STARDOCK entries
  planet_name VARCHAR(100),        -- For PLANET entries
  sector_name VARCHAR(100),        -- Optional name (e.g., "Sol (Earth)")
  note TEXT,                       -- Manual note or auto-generated description
  is_manual BOOLEAN DEFAULT FALSE, -- TRUE for manually added entries
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id, sector_number, log_type) -- One entry per sector per type per player
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_ship_logs_player ON ship_logs(player_id);
CREATE INDEX IF NOT EXISTS idx_ship_logs_universe ON ship_logs(universe_id);
CREATE INDEX IF NOT EXISTS idx_ship_logs_sector ON ship_logs(player_id, sector_number);
CREATE INDEX IF NOT EXISTS idx_ship_logs_type ON ship_logs(player_id, log_type);

COMMENT ON TABLE ship_logs IS 'Player ship log - tracks discovered sectors, ports, planets, and manual notes';
COMMENT ON COLUMN ship_logs.log_type IS 'SOL=starting sector, PLANET=planet found, PORT=trading port, DEAD_END=no exits, STARDOCK=ship dealer, MANUAL=player note';
COMMENT ON COLUMN ship_logs.is_manual IS 'TRUE for player-added entries that can be deleted';

