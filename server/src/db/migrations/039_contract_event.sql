-- Migration 039: TerraCorp contract dynamic event
-- Description: Adds the contract event type (TerraCorp posts a
-- delivery goal at one port and splits a credit pool between the
-- haulers who deliver) plus the table that tracks each player's
-- delivered units and settled payout per event.
-- Date: 2026-10-22

-- Widen the event type check so contract can be stored.
ALTER TABLE dynamic_events DROP CONSTRAINT IF EXISTS dynamic_events_type_check;
ALTER TABLE dynamic_events ADD CONSTRAINT dynamic_events_type_check
  CHECK (type IN ('ion_storm', 'incursion', 'port_strike', 'trade_boom', 'salvage_field', 'contract'));

-- One row per player per contract event: units of the contract
-- commodity they sold to the contract port while the event was
-- active, and the credits settlement paid them (null until settled,
-- which is also the guard that keeps settlement exactly once).
CREATE TABLE IF NOT EXISTS dynamic_event_contributions (
  event_id INTEGER NOT NULL REFERENCES dynamic_events(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL DEFAULT 0,
  paid_credits INTEGER,
  PRIMARY KEY (event_id, player_id)
);

GRANT ALL ON dynamic_events TO PUBLIC;
GRANT ALL ON dynamic_event_contributions TO PUBLIC;
