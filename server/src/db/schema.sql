-- TradeWars 2030 Database Schema

-- ============================================================================
-- USERS & AUTHENTICATION
-- ============================================================================

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================================
-- GAME UNIVERSES
-- ============================================================================

CREATE TABLE universes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  max_sectors INTEGER DEFAULT 1000,
  max_players INTEGER DEFAULT 100,
  turns_per_day INTEGER DEFAULT 1000,
  starting_credits INTEGER DEFAULT 2000,
  starting_ship_type VARCHAR(50) DEFAULT 'scout',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES users(id)
);

-- ============================================================================
-- PLAYERS
-- ============================================================================

CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  corp_name VARCHAR(100) NOT NULL,
  current_sector INTEGER,
  credits BIGINT DEFAULT 2000,
  turns_remaining INTEGER DEFAULT 1000,
  experience BIGINT DEFAULT 0,
  alignment INTEGER DEFAULT 0, -- -1000 (evil) to +1000 (good)
  ship_type VARCHAR(50) DEFAULT 'scout',
  ship_holds_max INTEGER DEFAULT 20,
  ship_fighters INTEGER DEFAULT 0,
  ship_shields INTEGER DEFAULT 0,
  ship_torpedoes INTEGER DEFAULT 0,
  ship_mines INTEGER DEFAULT 0,
  ship_beacons INTEGER DEFAULT 0,
  cargo_fuel INTEGER DEFAULT 0,
  cargo_organics INTEGER DEFAULT 0,
  cargo_equipment INTEGER DEFAULT 0,
  is_alive BOOLEAN DEFAULT TRUE,
  last_turn_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, universe_id)
);

CREATE INDEX idx_players_universe ON players(universe_id);
CREATE INDEX idx_players_user ON players(user_id);
CREATE INDEX idx_players_sector ON players(current_sector);

-- ============================================================================
-- SECTORS
-- ============================================================================

CREATE TABLE sectors (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  name VARCHAR(100),
  port_type VARCHAR(50), -- null, 'BBS', 'BSB', 'SBB', 'SSB', 'SBS', 'BSS', 'SSS', 'BBB'
  port_fuel_qty INTEGER DEFAULT 0,
  port_organics_qty INTEGER DEFAULT 0,
  port_equipment_qty INTEGER DEFAULT 0,
  port_fuel_pct INTEGER DEFAULT 100, -- percentage of max price
  port_organics_pct INTEGER DEFAULT 100,
  port_equipment_pct INTEGER DEFAULT 100,
  port_class INTEGER DEFAULT 1, -- Port class affects quantities
  has_planet BOOLEAN DEFAULT FALSE,
  planet_id INTEGER,
  has_beacon BOOLEAN DEFAULT FALSE,
  beacon_owner_id INTEGER REFERENCES players(id),
  fighters_count INTEGER DEFAULT 0, -- Deployed fighters
  mines_count INTEGER DEFAULT 0, -- Deployed mines
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(universe_id, sector_number)
);

CREATE INDEX idx_sectors_universe ON sectors(universe_id);
CREATE INDEX idx_sectors_number ON sectors(sector_number);
CREATE INDEX idx_sectors_port ON sectors(port_type) WHERE port_type IS NOT NULL;

-- ============================================================================
-- SECTOR WARPS (Connections between sectors)
-- ============================================================================

CREATE TABLE sector_warps (
  id SERIAL PRIMARY KEY,
  sector_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE,
  destination_sector_number INTEGER NOT NULL,
  is_two_way BOOLEAN DEFAULT TRUE, -- Most warps are bidirectional
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_warps_sector ON sector_warps(sector_id);

-- ============================================================================
-- PLANETS
-- ============================================================================

CREATE TABLE planets (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  sector_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE,
  owner_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  name VARCHAR(100),
  colonists INTEGER DEFAULT 0,
  fighters INTEGER DEFAULT 0,
  ore INTEGER DEFAULT 0,
  fuel INTEGER DEFAULT 0,
  organics INTEGER DEFAULT 0,
  equipment INTEGER DEFAULT 0,
  credits BIGINT DEFAULT 0,
  production_type VARCHAR(50) DEFAULT 'balanced', -- fuel, organics, equipment, balanced
  citadel_level INTEGER DEFAULT 0, -- 0 = none, higher = better defense
  last_production TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sector_id)
);

CREATE INDEX idx_planets_universe ON planets(universe_id);
CREATE INDEX idx_planets_owner ON planets(owner_id);
CREATE INDEX idx_planets_sector ON planets(sector_id);

-- ============================================================================
-- SHIP TYPES
-- ============================================================================

CREATE TABLE ship_types (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  holds INTEGER NOT NULL,
  fighters_max INTEGER DEFAULT 0,
  shields_max INTEGER DEFAULT 0,
  torpedoes_max INTEGER DEFAULT 0,
  mines_max INTEGER DEFAULT 0,
  beacons_max INTEGER DEFAULT 0,
  genesis_max INTEGER DEFAULT 0,
  turns_cost INTEGER NOT NULL, -- Turns to move 1 sector
  cost_credits BIGINT NOT NULL,
  description TEXT,
  UNIQUE(universe_id, name)
);

-- Ship types will be created by the seed script

-- ============================================================================
-- CORPORATIONS (Team/Alliance system)
-- ============================================================================

CREATE TABLE corporations (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  founder_id INTEGER REFERENCES players(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(universe_id, name)
);

CREATE TABLE corp_members (
  id SERIAL PRIMARY KEY,
  corp_id INTEGER REFERENCES corporations(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  rank VARCHAR(50) DEFAULT 'member', -- founder, officer, member
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id)
);

-- ============================================================================
-- GAME HISTORY & EVENTS
-- ============================================================================

CREATE TABLE game_events (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL, -- trade, combat, movement, planet, admin
  event_data JSONB, -- Flexible storage for event details
  sector_number INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_universe ON game_events(universe_id);
CREATE INDEX idx_events_player ON game_events(player_id);
CREATE INDEX idx_events_type ON game_events(event_type);
CREATE INDEX idx_events_time ON game_events(created_at);

-- ============================================================================
-- COMBAT LOG
-- ============================================================================

CREATE TABLE combat_log (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  attacker_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  defender_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  sector_number INTEGER NOT NULL,
  attacker_ship VARCHAR(50),
  defender_ship VARCHAR(50),
  winner_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  credits_looted BIGINT DEFAULT 0,
  cargo_looted JSONB,
  combat_details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_combat_universe ON combat_log(universe_id);
CREATE INDEX idx_combat_attacker ON combat_log(attacker_id);
CREATE INDEX idx_combat_defender ON combat_log(defender_id);

-- ============================================================================
-- TURN REGENERATION TRACKING
-- ============================================================================

CREATE TABLE turn_updates (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  last_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  turns_granted INTEGER DEFAULT 1000,
  UNIQUE(universe_id)
);
