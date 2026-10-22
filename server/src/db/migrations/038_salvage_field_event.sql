-- Migration 038: Salvage field dynamic event
-- Description: Adds the salvage_field event type (a region of fresh
-- derelicts that appear on activation and are swept away on resolution)
-- and tags derelicts with the event that spawned them, so event
-- cleanup can remove leftovers without ever touching derelicts that
-- were already drifting.
-- Date: 2026-10-22

-- Widen the event type check so salvage_field can be stored.
ALTER TABLE dynamic_events DROP CONSTRAINT IF EXISTS dynamic_events_type_check;
ALTER TABLE dynamic_events ADD CONSTRAINT dynamic_events_type_check
  CHECK (type IN ('ion_storm', 'incursion', 'port_strike', 'trade_boom', 'salvage_field'));

-- Which event spawned this derelict, if any. Ambient spawns leave it
-- null. On delete set null so resolved event cleanup stays a plain
-- delete of unboarded rows; the sweep runs before the event row could
-- ever be removed anyway.
ALTER TABLE derelicts ADD COLUMN IF NOT EXISTS event_id INTEGER
  REFERENCES dynamic_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_derelicts_event ON derelicts(event_id);

GRANT ALL ON dynamic_events TO PUBLIC;
GRANT ALL ON derelicts TO PUBLIC;
