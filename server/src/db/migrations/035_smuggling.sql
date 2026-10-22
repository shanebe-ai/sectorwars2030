-- Migration 035: Smuggling
-- Description: Contraband goods, black markets, customs patrols,
-- derelict stashes and customs auctions. Builds on the living economy
-- (028), derelicts (031) and dynamic events (032). Markets, patrols,
-- scans and reputation are driven by the smuggling tick in
-- smugglingService.ts on the same 5 minute cadence as the other ticks.
-- Date: 2026-10-22

-- Contraband catalog: the goods only black markets trade. Legal ports
-- refuse them. home_sectors / demand_sectors are sector ranges where
-- the good is cheap / where it pays, stored as [min, max] pairs.
CREATE TABLE IF NOT EXISTS contraband_goods (
  commodity VARCHAR(30) PRIMARY KEY,
  display_name VARCHAR(60) NOT NULL,
  base_price INTEGER NOT NULL,
  home_sectors JSONB NOT NULL DEFAULT '[]'::JSONB,
  demand_sectors JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO contraband_goods (commodity, display_name, base_price, home_sectors, demand_sectors) VALUES
  ('banned_tech', 'Banned Tech Components', 300, '[[101, 300]]'::JSONB, '[[701, 1000]]'::JSONB),
  ('restricted_meds', 'Restricted Medical Compounds', 220, '[[301, 500]]'::JSONB, '[[101, 200], [801, 1000]]'::JSONB),
  ('stolen_artifacts', 'Stolen Artifacts', 450, '[[501, 700]]'::JSONB, '[[201, 400]]'::JSONB)
ON CONFLICT (commodity) DO NOTHING;

-- Black markets: one row per port that can host a market. A port is a
-- sector with a port (port_id is sectors.id). prices is the snapshot
-- from the last smuggling tick: what players see before they arrive
-- and what trades execute at until the next tick moves it. drift is
-- the per good living economy drift, bounded like port_economy.
CREATE TABLE IF NOT EXISTS black_markets (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  port_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE,
  is_open BOOLEAN NOT NULL DEFAULT FALSE,
  opened_at TIMESTAMP,
  closes_at TIMESTAMP,
  premium_multiplier NUMERIC(5, 2) NOT NULL DEFAULT 1.0,
  prices JSONB NOT NULL DEFAULT '{}'::JSONB,
  drift JSONB NOT NULL DEFAULT '{}'::JSONB,
  prices_as_of TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(universe_id, sector_number)
);

CREATE INDEX IF NOT EXISTS idx_black_markets_open ON black_markets(universe_id) WHERE is_open;

-- Customs patrols: one row per active patrol. Patrols never spawn in
-- TerraSpace (sectors 1 to 10); the tick enforces that.
CREATE TABLE IF NOT EXISTS patrols (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  spawned_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_patrols_universe ON patrols(universe_id);
CREATE INDEX IF NOT EXISTS idx_patrols_sector ON patrols(universe_id, sector_number);

-- Derelict stashes: contraband cached in a cleared derelict. The stash
-- dies with the derelict (ON DELETE CASCADE follows the derelict
-- expiry window, exactly as the spec asks).
CREATE TABLE IF NOT EXISTS derelict_stashes (
  id SERIAL PRIMARY KEY,
  derelict_id INTEGER NOT NULL REFERENCES derelicts(id) ON DELETE CASCADE,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  commodity VARCHAR(30) NOT NULL REFERENCES contraband_goods(commodity),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(derelict_id, player_id, commodity)
);

CREATE INDEX IF NOT EXISTS idx_derelict_stashes_derelict ON derelict_stashes(derelict_id);

-- Customs auctions: confiscated cargo sold back into the legal market
-- at the port of seizure. Any player docked there can buy a lot at the
-- listed unit price until it sells out or expires.
CREATE TABLE IF NOT EXISTS contraband_auctions (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  commodity VARCHAR(30) NOT NULL REFERENCES contraband_goods(commodity),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL,
  seized_from INTEGER REFERENCES players(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contraband_auctions_sector ON contraband_auctions(universe_id, sector_number);

-- Smuggling log: every scan, confiscation, market flip, auction and
-- stash event, for the admin panel. Tuning with data, not vibes.
CREATE TABLE IF NOT EXISTS smuggling_log (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  event_type VARCHAR(30) NOT NULL CHECK (event_type IN (
    'scan_clean', 'confiscation', 'flagged', 'market_open', 'market_close',
    'auction_created', 'auction_buy', 'stash_deposit', 'stash_loot', 'trade'
  )),
  sector_number INTEGER,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smuggling_log_universe ON smuggling_log(universe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_smuggling_log_player ON smuggling_log(player_id, created_at DESC);

-- Per universe smuggling settings an admin can tune: the scan chance
-- multiplier and how many patrols sweep the universe.
CREATE TABLE IF NOT EXISTS smuggling_settings (
  universe_id INTEGER PRIMARY KEY REFERENCES universes(id) ON DELETE CASCADE,
  scan_chance_multiplier NUMERIC(6, 2) NOT NULL DEFAULT 1.0,
  patrol_count INTEGER NOT NULL DEFAULT 4,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Player side: reputation with the port authorities, the flagged
-- window, and hold space for the three contraband goods. Cargo lives
-- in columns on the player row, same as the legal commodities.
ALTER TABLE players ADD COLUMN IF NOT EXISTS contraband_rep INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS flagged_until TIMESTAMP;
ALTER TABLE players ADD COLUMN IF NOT EXISTS cargo_banned_tech INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS cargo_restricted_meds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS cargo_stolen_artifacts INTEGER NOT NULL DEFAULT 0;

-- The app role needs full access to the new tables. Migration 031
-- shipped without grants and the missing rights broke production
-- movement on 2026-10-16, so the grants live in the migration now.
GRANT ALL ON contraband_goods TO PUBLIC;
GRANT ALL ON black_markets TO PUBLIC;
GRANT ALL ON patrols TO PUBLIC;
GRANT ALL ON derelict_stashes TO PUBLIC;
GRANT ALL ON contraband_auctions TO PUBLIC;
GRANT ALL ON smuggling_log TO PUBLIC;
GRANT ALL ON smuggling_settings TO PUBLIC;
GRANT ALL ON SEQUENCE black_markets_id_seq TO PUBLIC;
GRANT ALL ON SEQUENCE patrols_id_seq TO PUBLIC;
GRANT ALL ON SEQUENCE derelict_stashes_id_seq TO PUBLIC;
GRANT ALL ON SEQUENCE contraband_auctions_id_seq TO PUBLIC;
GRANT ALL ON SEQUENCE smuggling_log_id_seq TO PUBLIC;
