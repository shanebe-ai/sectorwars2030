-- Migration 033: NPC trader ships
-- Description: Adds the npc_ships table for persistent named NPC traders.
-- NPCs warp between ports on the NPC tick in npcService.ts, trade small
-- amounts so port stock and prices move with zero humans online, show
-- up in sector traffic, and answer hails with market tips. They are
-- never destroyed and cannot be attacked or robbed in v1.
-- Date: 2026-10-19

CREATE TABLE IF NOT EXISTS npc_ships (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  ship_name VARCHAR(100) NOT NULL,
  ship_type VARCHAR(50) NOT NULL DEFAULT 'trader',
  current_sector INTEGER NOT NULL,
  destination_sector INTEGER,
  route JSONB NOT NULL DEFAULT '[]'::JSONB,
  cargo_fuel INTEGER NOT NULL DEFAULT 0,
  cargo_organics INTEGER NOT NULL DEFAULT 0,
  cargo_equipment INTEGER NOT NULL DEFAULT 0,
  holds_max INTEGER NOT NULL DEFAULT 50,
  credits INTEGER NOT NULL DEFAULT 10000,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(universe_id, name)
);

CREATE INDEX IF NOT EXISTS idx_npc_ships_universe ON npc_ships(universe_id);
CREATE INDEX IF NOT EXISTS idx_npc_ships_sector ON npc_ships(universe_id, current_sector);

-- Same lesson as migration 032: grants ship with the table.
GRANT ALL ON npc_ships TO PUBLIC;
GRANT ALL ON SEQUENCE npc_ships_id_seq TO PUBLIC;
