-- TradeWars 2030 Database Schema
-- Complete schema including all features and migrations

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
  ship_genesis INTEGER DEFAULT 0,
  cargo_fuel INTEGER DEFAULT 0,
  cargo_organics INTEGER DEFAULT 0,
  cargo_equipment INTEGER DEFAULT 0,
  colonists INTEGER DEFAULT 0, -- For planet colonization
  last_combat_at TIMESTAMP, -- Combat tracking
  kills INTEGER DEFAULT 0,
  deaths INTEGER DEFAULT 0,
  in_escape_pod BOOLEAN DEFAULT FALSE,
  has_alien_comms BOOLEAN DEFAULT FALSE, -- Alien communications unlocked
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
  region VARCHAR(50), -- Region name (e.g., TerraSpace for sectors 1-10)
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
  owner_name VARCHAR(100),
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
  is_claimable BOOLEAN DEFAULT TRUE, -- Whether players can claim this planet
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

-- ============================================================================
-- SHIP COMMUNICATIONS (Player Messages)
-- ============================================================================

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  recipient_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  sender_name VARCHAR(100), -- Cached for display after player deletion
  subject VARCHAR(200),
  body TEXT NOT NULL,
  message_type VARCHAR(50) DEFAULT 'DIRECT',
  corp_id INTEGER REFERENCES corporations(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT FALSE,
  is_deleted_by_sender BOOLEAN DEFAULT FALSE,
  is_deleted_by_recipient BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP
);

CREATE INDEX idx_messages_universe ON messages(universe_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_recipient ON messages(recipient_id);
CREATE INDEX idx_messages_unread ON messages(recipient_id, is_read) WHERE is_read = FALSE;

-- ============================================================================
-- PLAYER ENCOUNTERS (from migration 003)
-- ============================================================================

CREATE TABLE player_encounters (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  encountered_player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  first_met_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_met_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  encounter_count INTEGER DEFAULT 1,
  UNIQUE(player_id, encountered_player_id, universe_id)
);

CREATE INDEX idx_encounters_player ON player_encounters(player_id);
CREATE INDEX idx_encounters_universe ON player_encounters(universe_id);

-- ============================================================================
-- MESSAGE DELETIONS (from migration 004)
-- ============================================================================

CREATE TABLE message_deletions (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id, message_id)
);

-- ============================================================================
-- MESSAGE READS (from migration 006)
-- ============================================================================

CREATE TABLE message_reads (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id, message_id)
);

-- ============================================================================
-- SHIP LOGS (from migration 007)
-- ============================================================================

CREATE TABLE ship_logs (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  log_type VARCHAR(50) NOT NULL, -- 'SOL', 'PORT', 'STARDOCK', 'PLANET', 'DEAD_END', 'NOTE'
  description TEXT NOT NULL,
  is_auto BOOLEAN DEFAULT TRUE, -- Auto-generated vs manual notes
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id, sector_number, log_type, is_auto)
);

CREATE INDEX idx_ship_logs_player ON ship_logs(player_id);
CREATE INDEX idx_ship_logs_sector ON ship_logs(sector_number);

-- ============================================================================
-- BANKING SYSTEM (from migration 010)
-- ============================================================================

CREATE TABLE bank_accounts (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  account_type VARCHAR(20) NOT NULL, -- 'personal', 'corporate'
  corp_id INTEGER REFERENCES corporations(id) ON DELETE CASCADE, -- For corporate accounts
  balance BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id, account_type, corp_id)
);

CREATE TABLE bank_transactions (
  id SERIAL PRIMARY KEY,
  account_id INTEGER REFERENCES bank_accounts(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL, -- 'deposit', 'withdraw', 'transfer_in', 'transfer_out'
  amount BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  memo TEXT,
  related_player_id INTEGER REFERENCES players(id), -- For transfers
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bank_accounts_player ON bank_accounts(player_id);
CREATE INDEX idx_bank_transactions_account ON bank_transactions(account_id);

-- ============================================================================
-- COMBAT SYSTEM ENHANCEMENTS (from migration 011)
-- ============================================================================

ALTER TABLE combat_log ADD COLUMN IF NOT EXISTS rounds_fought INTEGER DEFAULT 1;
ALTER TABLE combat_log ADD COLUMN IF NOT EXISTS attacker_fighters_lost INTEGER DEFAULT 0;
ALTER TABLE combat_log ADD COLUMN IF NOT EXISTS defender_fighters_lost INTEGER DEFAULT 0;
ALTER TABLE combat_log ADD COLUMN IF NOT EXISTS attacker_shields_lost INTEGER DEFAULT 0;
ALTER TABLE combat_log ADD COLUMN IF NOT EXISTS defender_shields_lost INTEGER DEFAULT 0;
ALTER TABLE combat_log ADD COLUMN IF NOT EXISTS defender_destroyed BOOLEAN DEFAULT FALSE;
ALTER TABLE combat_log ADD COLUMN IF NOT EXISTS attacker_fled BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- FLOATING CARGO (from migration 012)
-- ============================================================================

CREATE TABLE sector_cargo (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  cargo_type VARCHAR(20) NOT NULL, -- 'fuel', 'organics', 'equipment'
  quantity INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
  UNIQUE(universe_id, sector_number, cargo_type)
);

-- ============================================================================
-- BEACON SYSTEM (from migration 013)
-- ============================================================================

CREATE TABLE sector_beacons (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  owner_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(universe_id, sector_number)
);

-- ============================================================================
-- SECTOR FIGHTERS (from migration 014)
-- ============================================================================

CREATE TABLE sector_fighters (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  owner_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  owner_name VARCHAR(100),
  fighter_count INTEGER NOT NULL,
  deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_maintenance TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(universe_id, sector_number, owner_id)
);

CREATE INDEX idx_sector_fighters_sector ON sector_fighters(universe_id, sector_number);
CREATE INDEX idx_sector_fighters_owner ON sector_fighters(owner_id);

-- ============================================================================
-- SECTOR MINES (from migration 015)
-- ============================================================================

CREATE TABLE sector_mines (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  owner_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  owner_name VARCHAR(100),
  mine_count INTEGER NOT NULL,
  deployed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(universe_id, sector_number, owner_id)
);

CREATE INDEX idx_sector_mines_sector ON sector_mines(universe_id, sector_number);
CREATE INDEX idx_sector_mines_owner ON sector_mines(owner_id);

-- ============================================================================
-- ALIEN SYSTEM (from migration 016)
-- ============================================================================

CREATE TABLE alien_planets (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  alien_race VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  citadel_level INTEGER DEFAULT 3,
  fighters INTEGER DEFAULT 1000,
  colonists INTEGER DEFAULT 50000,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(universe_id, sector_number)
);

CREATE TABLE alien_ships (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  alien_race VARCHAR(50) NOT NULL,
  ship_type VARCHAR(50) NOT NULL,
  behavior VARCHAR(20) NOT NULL, -- 'patrol', 'trade', 'aggressive', 'defensive'
  fighters INTEGER NOT NULL,
  shields INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE alien_communications (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  alien_race VARCHAR(50),
  message_type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  sector_number INTEGER,
  related_player_id INTEGER REFERENCES players(id),
  related_ship_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE player_alien_unlocks (
  id SERIAL PRIMARY KEY,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id, universe_id)
);

CREATE INDEX idx_alien_planets_universe ON alien_planets(universe_id);
CREATE INDEX idx_alien_planets_sector ON alien_planets(universe_id, sector_number);
CREATE INDEX idx_alien_ships_sector ON alien_ships(universe_id, sector_number);
CREATE INDEX idx_alien_comms_universe ON alien_communications(universe_id);

-- ============================================================================
-- CORPORATION PLAYER LINK (from migration 018)
-- ============================================================================

ALTER TABLE players ADD COLUMN IF NOT EXISTS corp_id INTEGER REFERENCES corporations(id);

-- ============================================================================
-- ALIEN TRADING (from migration 021)
-- ============================================================================

CREATE TABLE alien_trade_offers (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  alien_ship_id INTEGER REFERENCES alien_ships(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  offer_type VARCHAR(20) NOT NULL, -- 'buy', 'sell'
  cargo_type VARCHAR(20) NOT NULL, -- 'fuel', 'organics', 'equipment'
  quantity INTEGER NOT NULL,
  price_per_unit INTEGER NOT NULL,
  expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 minutes'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE alien_trade_history (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  alien_ship_id INTEGER REFERENCES alien_ships(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  cargo_type VARCHAR(20) NOT NULL,
  quantity INTEGER NOT NULL,
  price_per_unit INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  trade_type VARCHAR(20) NOT NULL, -- 'buy', 'sell'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PLAYER TRADING (from migration 022)
-- ============================================================================

CREATE TABLE player_trade_offers (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  initiator_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  target_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  -- What initiator wants
  initiator_requests_fuel INTEGER DEFAULT 0,
  initiator_requests_organics INTEGER DEFAULT 0,
  initiator_requests_equipment INTEGER DEFAULT 0,
  initiator_requests_credits BIGINT DEFAULT 0,
  -- What initiator offers
  initiator_offers_fuel INTEGER DEFAULT 0,
  initiator_offers_organics INTEGER DEFAULT 0,
  initiator_offers_equipment INTEGER DEFAULT 0,
  initiator_offers_credits BIGINT DEFAULT 0,
  expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE player_trade_history (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  initiator_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  target_id INTEGER REFERENCES players(id) ON DELETE CASCADE,
  -- What was traded
  fuel_traded INTEGER DEFAULT 0,
  organics_traded INTEGER DEFAULT 0,
  equipment_traded INTEGER DEFAULT 0,
  credits_traded BIGINT DEFAULT 0,
  trade_type VARCHAR(20) NOT NULL, -- 'accepted', 'cancelled'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
