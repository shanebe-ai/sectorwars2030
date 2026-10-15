-- Migration 031: Derelicts, anomalies, and new Stardock ships
-- Description: Adds derelicts and anomalies tables for the derelicts and
-- anomalies feature, adds display_name to ship_types with backfill, and
-- inserts five new buyable ships (universe_id NULL).
-- Date: 2026-10-15

-- Derelicts: abandoned ships scattered through deep space.
CREATE TABLE IF NOT EXISTS derelicts (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('wreck', 'ghost', 'liner')),
  state VARCHAR(20) NOT NULL DEFAULT 'spotted' CHECK (state IN ('spotted', 'boarded', 'claimed')),
  loot JSONB NOT NULL DEFAULT '{}'::JSONB,
  claimed_by INTEGER REFERENCES players(id) ON DELETE SET NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(universe_id, sector_number)
);

CREATE INDEX IF NOT EXISTS idx_derelicts_universe ON derelicts(universe_id);
CREATE INDEX IF NOT EXISTS idx_derelicts_expires ON derelicts(expires_at);
CREATE INDEX IF NOT EXISTS idx_derelicts_state ON derelicts(universe_id, state);

-- Anomalies: temporary sector weather.
CREATE TABLE IF NOT EXISTS anomalies (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('ion', 'gravity', 'radiation', 'nebula')),
  ends_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(universe_id, sector_number)
);

CREATE INDEX IF NOT EXISTS idx_anomalies_universe ON anomalies(universe_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_ends ON anomalies(ends_at);
CREATE INDEX IF NOT EXISTS idx_anomalies_sector ON anomalies(universe_id, sector_number);

-- Ship types gain a display name for the Stardock list.
ALTER TABLE ship_types ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);

-- Backfill display names for the six existing ships.
UPDATE ship_types SET display_name = 'Escape Pod' WHERE name = 'escape_pod' AND display_name IS NULL;
UPDATE ship_types SET display_name = 'Scout' WHERE name = 'scout' AND display_name IS NULL;
UPDATE ship_types SET display_name = 'Trader' WHERE name = 'trader' AND display_name IS NULL;
UPDATE ship_types SET display_name = 'Freighter' WHERE name = 'freighter' AND display_name IS NULL;
UPDATE ship_types SET display_name = 'Merchant Cruiser' WHERE name = 'merchant_cruiser' AND display_name IS NULL;
UPDATE ship_types SET display_name = 'Corporate Flagship' WHERE name = 'corporate_flagship' AND display_name IS NULL;

-- Five new buyable ships, global to every universe (universe_id NULL).
-- Ordered here by cost; the Stardock query orders by cost_credits.
-- Note: the UNIQUE(universe_id, name) constraint treats NULL as distinct,
-- so plain ON CONFLICT would not catch re runs. WHERE NOT EXISTS keeps
-- each insert idempotent instead.
INSERT INTO ship_types
  (universe_id, name, display_name, holds, fighters_max, shields_max,
   torpedoes_max, mines_max, beacons_max, genesis_max, turns_cost,
   cost_credits, description)
SELECT NULL, 'scout_marauder', 'Scout Marauder', 35, 30, 200,
   1, 0, 10, 0, 1,
   30000, 'Combat scout for the pilot who wants to fight before they can afford to trade.'
WHERE NOT EXISTS (SELECT 1 FROM ship_types WHERE universe_id IS NULL AND name = 'scout_marauder');

INSERT INTO ship_types
  (universe_id, name, display_name, holds, fighters_max, shields_max,
   torpedoes_max, mines_max, beacons_max, genesis_max, turns_cost,
   cost_credits, description)
SELECT NULL, 'missile_frigate', 'Missile Frigate', 45, 25, 300,
   4, 2, 10, 2, 1,
   100000, 'Four torpedo tubes and a grudge. Built to crack fortified sectors, miserable at hauling freight.'
WHERE NOT EXISTS (SELECT 1 FROM ship_types WHERE universe_id IS NULL AND name = 'missile_frigate');

INSERT INTO ship_types
  (universe_id, name, display_name, holds, fighters_max, shields_max,
   torpedoes_max, mines_max, beacons_max, genesis_max, turns_cost,
   cost_credits, description)
SELECT NULL, 'havoc_gunstar', 'Havoc Gunstar', 80, 45, 1500,
   3, 5, 10, 4, 1,
   350000, 'The evil corp ship of choice, now sold to anyone with credits. Heavy shielding around a gunship heart.'
WHERE NOT EXISTS (SELECT 1 FROM ship_types WHERE universe_id IS NULL AND name = 'havoc_gunstar');

INSERT INTO ship_types
  (universe_id, name, display_name, holds, fighters_max, shields_max,
   torpedoes_max, mines_max, beacons_max, genesis_max, turns_cost,
   cost_credits, description)
SELECT NULL, 'tholian_sentinel', 'Tholian Sentinel', 60, 35, 1800,
   2, 5, 10, 3, 1,
   400000, 'A flying fortress with one job: hold ground. Buy it to guard what matters, not to trade.'
WHERE NOT EXISTS (SELECT 1 FROM ship_types WHERE universe_id IS NULL AND name = 'tholian_sentinel');

INSERT INTO ship_types
  (universe_id, name, display_name, holds, fighters_max, shields_max,
   torpedoes_max, mines_max, beacons_max, genesis_max, turns_cost,
   cost_credits, description)
SELECT NULL, 'interdictor_cruiser', 'Interdictor Cruiser', 100, 60, 2500,
   5, 5, 10, 6, 1,
   750000, 'Endgame siege hull. More fighters than anything afloat, with the shielding to match.'
WHERE NOT EXISTS (SELECT 1 FROM ship_types WHERE universe_id IS NULL AND name = 'interdictor_cruiser');
