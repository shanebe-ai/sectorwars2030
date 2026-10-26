-- Migration 040: Pirate Flotilla dynamic event
-- Description: Adds the pirate_flotilla event type. Pirates are
-- alien_ships rows owned by a dynamic event: the event marker, the
-- raider flag, and the fixed TerraCorp kill bonus live on the ship
-- row, and a pirate_encounters table tracks each hail or raid
-- between a pirate and a player. Fights run through the flotilla
-- encounter service, never the alien combat simulator.
-- Date: 2026-10-26

-- Widen the event type check so pirate_flotilla can be stored.
ALTER TABLE dynamic_events DROP CONSTRAINT IF EXISTS dynamic_events_type_check;
ALTER TABLE dynamic_events ADD CONSTRAINT dynamic_events_type_check
  CHECK (type IN ('ion_storm', 'incursion', 'port_strike', 'trade_boom', 'salvage_field', 'contract', 'pirate_flotilla'));

-- Widen the alien behaviour check (present on databases built from
-- migration 016) so pirate rows can be stored. Dropping first keeps
-- the migration safe to run more than once, and on databases whose
-- alien_ships table never had the check this simply adds it.
ALTER TABLE alien_ships DROP CONSTRAINT IF EXISTS alien_ships_behavior_check;
ALTER TABLE alien_ships ADD CONSTRAINT alien_ships_behavior_check
  CHECK (behavior IN ('patrol', 'trade', 'aggressive', 'defensive', 'pirate'));

-- The event marker: a ship is a pirate if and only if this is set.
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS dynamic_event_id INTEGER REFERENCES dynamic_events(id) ON DELETE SET NULL;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS is_raider BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS bounty_value INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_alien_ships_event ON alien_ships(dynamic_event_id);

-- One row per hail or raid between a pirate and a player. demand is
-- the toll snapshot taken at hail time (toll rows only). State runs
-- hailed, then one of paid, fled, won, lost, or expired when the
-- event ends with the hail still open. A paid toll row also carries
-- the peace terms the pirate offered inside demand, and the row is
-- recycled if that pirate ever hails the player again under those
-- terms (a cooldown lapsing, or a pirate breaking its word).
CREATE TABLE IF NOT EXISTS pirate_encounters (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES dynamic_events(id) ON DELETE CASCADE,
  pirate_ship_id INTEGER REFERENCES alien_ships(id) ON DELETE SET NULL,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('toll', 'raid')),
  state VARCHAR(10) NOT NULL DEFAULT 'hailed'
    CHECK (state IN ('hailed', 'paid', 'fled', 'won', 'lost', 'expired')),
  demand JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

-- A pirate hails a given player once at a time: one toll row per
-- pirate and player, recycled across hails. Raid rows repeat freely,
-- one per sector entry.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pirate_encounters_toll_unique
  ON pirate_encounters (pirate_ship_id, player_id, kind) WHERE kind = 'toll';
CREATE INDEX IF NOT EXISTS idx_pirate_encounters_event ON pirate_encounters(event_id);
CREATE INDEX IF NOT EXISTS idx_pirate_encounters_player ON pirate_encounters(player_id);

GRANT ALL ON dynamic_events TO PUBLIC;
GRANT ALL ON alien_ships TO PUBLIC;
GRANT ALL ON pirate_encounters TO PUBLIC;
GRANT ALL ON SEQUENCE pirate_encounters_id_seq TO PUBLIC;
