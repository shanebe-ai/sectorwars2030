-- Migration 023: Fix sector_cargo schema drift
--
-- sectorController.ts queries sector_cargo with the denormalized layout
-- (fuel, organics, equipment, colonists), but schema.sql creates the legacy
-- layout (cargo_type, quantity). Migration 012 defined the new layout with
-- CREATE TABLE IF NOT EXISTS, which is a silent no-op on databases built
-- from schema.sql, so the old table survived and queries failed at runtime
-- with: column "fuel" does not exist.
--
-- This migration transforms the existing table in place. It is idempotent:
-- safe to run on databases that already have the new layout.

ALTER TABLE sector_cargo ADD COLUMN IF NOT EXISTS fuel INTEGER DEFAULT 0;
ALTER TABLE sector_cargo ADD COLUMN IF NOT EXISTS organics INTEGER DEFAULT 0;
ALTER TABLE sector_cargo ADD COLUMN IF NOT EXISTS equipment INTEGER DEFAULT 0;
ALTER TABLE sector_cargo ADD COLUMN IF NOT EXISTS colonists INTEGER DEFAULT 0;
ALTER TABLE sector_cargo ADD COLUMN IF NOT EXISTS source_event VARCHAR(50);
ALTER TABLE sector_cargo ADD COLUMN IF NOT EXISTS source_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL;

-- Migrate legacy cargo_type/quantity rows into the matching new columns.
-- Skipped entirely when the legacy cargo_type column does not exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sector_cargo' AND column_name = 'cargo_type'
  ) THEN
    UPDATE sector_cargo SET fuel = quantity WHERE cargo_type = 'fuel';
    UPDATE sector_cargo SET organics = quantity WHERE cargo_type = 'organics';
    UPDATE sector_cargo SET equipment = quantity WHERE cargo_type = 'equipment';
    UPDATE sector_cargo SET colonists = quantity WHERE cargo_type = 'colonists';
    UPDATE sector_cargo SET source_event = 'legacy'
      WHERE source_event IS NULL AND cargo_type IS NOT NULL;
  END IF;
END $$;

-- Indexes matching the intent of migration 012
CREATE INDEX IF NOT EXISTS idx_sector_cargo_universe ON sector_cargo(universe_id);
CREATE INDEX IF NOT EXISTS idx_sector_cargo_sector ON sector_cargo(universe_id, sector_number);
CREATE INDEX IF NOT EXISTS idx_sector_cargo_expires ON sector_cargo(expires_at);

COMMENT ON TABLE sector_cargo IS 'Floating cargo in sectors - from combat, jettison, etc.';
