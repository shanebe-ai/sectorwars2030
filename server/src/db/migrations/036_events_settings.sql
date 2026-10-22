-- Migration 036: Dynamic events on/off switch
-- Description: Adds an events_enabled flag to dynamic_event_settings
-- so an admin can stop new dynamic events from seeding in a universe.
-- The default is TRUE on purpose: events have seeded in every
-- universe since migration 032, so existing universes keep their
-- current behaviour until an admin turns them off. Switching off
-- only stops new seeding; events already brewing or active finish
-- naturally.
-- Date: 2026-10-22

ALTER TABLE dynamic_event_settings
  ADD COLUMN IF NOT EXISTS events_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Grants already cover the table from migration 032; restated so the
-- file is self contained like the others.
GRANT ALL ON dynamic_event_settings TO PUBLIC;
