-- Migration 032: Dynamic events
-- Description: Adds the dynamic_events table for universe scale events
-- (ion storms, alien incursions, port strikes) plus a small settings
-- table holding the per universe seeding cooldown an admin can set.
-- Events are seeded and advanced by the event tick in
-- dynamicEventService.ts and announced through TNN.
-- Date: 2026-10-19

-- Dynamic events: one row per event, moving brewing -> active -> resolved.
-- region_sectors holds the affected sector numbers as a JSON list.
-- target_port_id is the sectors.id of the struck port (port strikes only).
-- params carries per type tuning knobs (spread chance, defender strength,
-- salvage tables) so tuning never needs a schema change.
CREATE TABLE IF NOT EXISTS dynamic_events (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('ion_storm', 'incursion', 'port_strike')),
  state VARCHAR(20) NOT NULL DEFAULT 'brewing' CHECK (state IN ('brewing', 'active', 'resolved')),
  region_sectors JSONB NOT NULL DEFAULT '[]'::JSONB,
  target_port_id INTEGER REFERENCES sectors(id) ON DELETE SET NULL,
  brewing_ends_at TIMESTAMP NOT NULL,
  active_ends_at TIMESTAMP,
  params JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dynamic_events_universe ON dynamic_events(universe_id);
CREATE INDEX IF NOT EXISTS idx_dynamic_events_state ON dynamic_events(universe_id, state);
CREATE INDEX IF NOT EXISTS idx_dynamic_events_created ON dynamic_events(universe_id, created_at);

-- Per universe event settings. cooldown_until suppresses new event
-- seeding until the timestamp passes; set from the admin endpoints.
CREATE TABLE IF NOT EXISTS dynamic_event_settings (
  universe_id INTEGER PRIMARY KEY REFERENCES universes(id) ON DELETE CASCADE,
  cooldown_until TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- The app role needs full access to the new tables. Migration 031
-- shipped without grants and the missing rights broke production
-- movement on 2026-10-16, so the grants live in the migration now.
GRANT ALL ON dynamic_events TO PUBLIC;
GRANT ALL ON dynamic_event_settings TO PUBLIC;
GRANT ALL ON SEQUENCE dynamic_events_id_seq TO PUBLIC;
