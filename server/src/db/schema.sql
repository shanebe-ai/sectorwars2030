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
  notification_seen BOOLEAN DEFAULT FALSE,
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id, account_type, corp_id)
);

CREATE TABLE bank_transactions (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES bank_accounts(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL, -- 'deposit', 'withdraw', 'transfer_in', 'transfer_out'
  amount BIGINT NOT NULL,
  balance_before BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  related_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
  related_player_name VARCHAR(100),
  related_corp_name VARCHAR(100),
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
  fuel INTEGER DEFAULT 0,
  organics INTEGER DEFAULT 0,
  equipment INTEGER DEFAULT 0,
  colonists INTEGER DEFAULT 0,
  source_event VARCHAR(50), -- 'combat', 'jettison', 'wreckage'
  source_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
);

CREATE INDEX idx_sector_cargo_universe ON sector_cargo(universe_id);
CREATE INDEX idx_sector_cargo_sector ON sector_cargo(universe_id, sector_number);
CREATE INDEX idx_sector_cargo_expires ON sector_cargo(expires_at);

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
  ship_name VARCHAR(100),
  current_sector INTEGER,
  credits INTEGER DEFAULT 50000,
  cargo_fuel INTEGER DEFAULT 0,
  cargo_organics INTEGER DEFAULT 0,
  cargo_equipment INTEGER DEFAULT 0,
  alignment INTEGER DEFAULT -200,
  kills INTEGER DEFAULT 0,
  home_sector INTEGER,
  last_move_at TIMESTAMP DEFAULT NOW(),
  last_action_at TIMESTAMP DEFAULT NOW(),
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
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  alien_ship_id INTEGER NOT NULL REFERENCES alien_ships(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- What the alien is offering to the player
  alien_offers_fuel INTEGER NOT NULL DEFAULT 0,
  alien_offers_organics INTEGER NOT NULL DEFAULT 0,
  alien_offers_equipment INTEGER NOT NULL DEFAULT 0,
  alien_offers_credits INTEGER NOT NULL DEFAULT 0,

  -- What the alien wants from the player
  alien_requests_fuel INTEGER NOT NULL DEFAULT 0,
  alien_requests_organics INTEGER NOT NULL DEFAULT 0,
  alien_requests_equipment INTEGER NOT NULL DEFAULT 0,
  alien_requests_credits INTEGER NOT NULL DEFAULT 0,

  -- Pricing information (for display/validation)
  alien_alignment INTEGER NOT NULL, -- Copy of alien's alignment at offer time
  price_modifier DECIMAL(5,2) NOT NULL DEFAULT 1.0, -- Alignment-based price adjustment

  -- Status and timing
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, accepted, expired, cancelled, robbed
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
  completed_at TIMESTAMP,

  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled', 'robbed')),
  CONSTRAINT valid_cargo CHECK (
    alien_offers_fuel >= 0 AND alien_offers_organics >= 0 AND alien_offers_equipment >= 0 AND alien_offers_credits >= 0 AND
    alien_requests_fuel >= 0 AND alien_requests_organics >= 0 AND alien_requests_equipment >= 0 AND alien_requests_credits >= 0
  ),
  CONSTRAINT valid_expiry CHECK (expires_at > created_at)
);

CREATE INDEX idx_alien_trade_offers_player ON alien_trade_offers(player_id) WHERE status = 'pending';
CREATE INDEX idx_alien_trade_offers_alien_ship ON alien_trade_offers(alien_ship_id) WHERE status = 'pending';
CREATE INDEX idx_alien_trade_offers_universe ON alien_trade_offers(universe_id);
CREATE INDEX idx_alien_trade_offers_expires ON alien_trade_offers(expires_at) WHERE status = 'pending';
CREATE INDEX idx_alien_trade_offers_status ON alien_trade_offers(status);

CREATE TABLE alien_trade_history (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  alien_ship_id INTEGER NOT NULL REFERENCES alien_ships(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- What was traded
  fuel_traded INTEGER NOT NULL DEFAULT 0, -- Positive = player received, negative = player gave
  organics_traded INTEGER NOT NULL DEFAULT 0,
  equipment_traded INTEGER NOT NULL DEFAULT 0,
  credits_traded INTEGER NOT NULL DEFAULT 0,

  -- Trade outcome
  outcome VARCHAR(20) NOT NULL, -- 'completed', 'robbery_success', 'robbery_combat'
  was_robbery BOOLEAN NOT NULL DEFAULT FALSE,
  robber_id INTEGER REFERENCES players(id) ON DELETE SET NULL, -- NULL if not a robbery

  -- Context
  alien_race VARCHAR(50) NOT NULL,
  alien_alignment INTEGER NOT NULL,
  sector_number INTEGER NOT NULL,

  -- Timestamp
  traded_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_outcome CHECK (outcome IN ('completed', 'robbery_success', 'robbery_combat'))
);

CREATE INDEX idx_alien_trade_history_player ON alien_trade_history(player_id);
CREATE INDEX idx_alien_trade_history_universe ON alien_trade_history(universe_id);
CREATE INDEX idx_alien_trade_history_alien_ship ON alien_trade_history(alien_ship_id);
CREATE INDEX idx_alien_trade_history_traded_at ON alien_trade_history(traded_at DESC);
CREATE INDEX idx_alien_trade_history_robbery ON alien_trade_history(was_robbery) WHERE was_robbery = TRUE;

-- ============================================================================
-- PLAYER TRADING (from migration 022)
-- ============================================================================

CREATE TABLE player_trade_offers (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,

  -- Players involved
  initiator_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recipient_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- Location (must be same sector at creation AND acceptance)
  sector_id INTEGER NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,

  -- Offer status
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled', 'robbed')),

  -- What initiator is offering
  initiator_offers_fuel INTEGER NOT NULL DEFAULT 0 CHECK (initiator_offers_fuel >= 0),
  initiator_offers_organics INTEGER NOT NULL DEFAULT 0 CHECK (initiator_offers_organics >= 0),
  initiator_offers_equipment INTEGER NOT NULL DEFAULT 0 CHECK (initiator_offers_equipment >= 0),
  initiator_offers_credits BIGINT NOT NULL DEFAULT 0 CHECK (initiator_offers_credits >= 0),

  -- What initiator is requesting
  initiator_requests_fuel INTEGER NOT NULL DEFAULT 0 CHECK (initiator_requests_fuel >= 0),
  initiator_requests_organics INTEGER NOT NULL DEFAULT 0 CHECK (initiator_requests_organics >= 0),
  initiator_requests_equipment INTEGER NOT NULL DEFAULT 0 CHECK (initiator_requests_equipment >= 0),
  initiator_requests_credits BIGINT NOT NULL DEFAULT 0 CHECK (initiator_requests_credits >= 0),

  -- Optional message (sanitize for XSS on input)
  message TEXT,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL, -- 24 hours from creation
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT different_players CHECK (initiator_player_id != recipient_player_id),
  CONSTRAINT has_offers CHECK (
    initiator_offers_fuel > 0 OR
    initiator_offers_organics > 0 OR
    initiator_offers_equipment > 0 OR
    initiator_offers_credits > 0
  ),
  CONSTRAINT has_requests CHECK (
    initiator_requests_fuel > 0 OR
    initiator_requests_organics > 0 OR
    initiator_requests_equipment > 0 OR
    initiator_requests_credits > 0
  )
);

-- Indexes for performance
CREATE INDEX idx_player_trade_offers_initiator_pending
  ON player_trade_offers(initiator_player_id)
  WHERE status = 'pending';

CREATE INDEX idx_player_trade_offers_recipient_pending
  ON player_trade_offers(recipient_player_id)
  WHERE status = 'pending';

CREATE INDEX idx_player_trade_offers_universe
  ON player_trade_offers(universe_id);

CREATE INDEX idx_player_trade_offers_expires_pending
  ON player_trade_offers(expires_at)
  WHERE status = 'pending';

CREATE INDEX idx_player_trade_offers_sector_pending
  ON player_trade_offers(sector_id)
  WHERE status = 'pending';

CREATE INDEX idx_player_trade_offers_created
  ON player_trade_offers(created_at DESC);

CREATE TABLE player_trade_history (
  id SERIAL PRIMARY KEY,
  offer_id INTEGER NOT NULL REFERENCES player_trade_offers(id) ON DELETE CASCADE,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,

  -- Players involved
  initiator_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  recipient_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,

  -- Location
  sector_id INTEGER NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,

  -- Action taken
  action VARCHAR(20) NOT NULL CHECK (action IN ('accepted', 'cancelled', 'expired', 'robbed_success', 'robbed_failed')),

  -- Resources transferred (actual amounts, may differ from offer if partial)
  fuel_transferred INTEGER NOT NULL DEFAULT 0,
  organics_transferred INTEGER NOT NULL DEFAULT 0,
  equipment_transferred INTEGER NOT NULL DEFAULT 0,
  credits_transferred BIGINT NOT NULL DEFAULT 0,

  -- Timestamp
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for history queries
CREATE INDEX idx_player_trade_history_initiator
  ON player_trade_history(initiator_player_id, created_at DESC);

CREATE INDEX idx_player_trade_history_recipient
  ON player_trade_history(recipient_player_id, created_at DESC);

CREATE INDEX idx_player_trade_history_universe
  ON player_trade_history(universe_id);

CREATE INDEX idx_player_trade_history_offer
  ON player_trade_history(offer_id);

-- ============================================================================
-- LIVING ECONOMY (migration 028)
-- ============================================================================

CREATE TABLE port_economy (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  sector_number INTEGER NOT NULL,
  commodity VARCHAR(20) NOT NULL CHECK (commodity IN ('fuel', 'organics', 'equipment')),
  volume_bought INTEGER DEFAULT 0,
  volume_sold INTEGER DEFAULT 0,
  drift NUMERIC(5, 4) DEFAULT 0,
  last_restock TIMESTAMP DEFAULT NOW(),
  event_state VARCHAR(20) DEFAULT 'none' CHECK (event_state IN ('none', 'scarcity', 'surplus')),
  event_ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(universe_id, sector_number, commodity)
);

CREATE INDEX idx_port_economy_sector ON port_economy(universe_id, sector_number);
CREATE INDEX idx_port_economy_event ON port_economy(event_state) WHERE event_state != 'none';

-- ============================================================================
-- BOUNTIES (migration 029)
-- ============================================================================

CREATE TABLE bounties (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  target_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  placer_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount >= 5000),
  signed BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'claimed', 'expired', 'refunded')),
  claimed_by_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  claimed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days',
  CHECK (target_player_id != placer_player_id)
);

CREATE INDEX idx_bounties_target ON bounties(target_player_id) WHERE status = 'active';
CREATE INDEX idx_bounties_status ON bounties(status);
CREATE INDEX idx_bounties_expires ON bounties(expires_at) WHERE status = 'active';

CREATE TABLE bounty_hunters (
  player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  bounties_claimed INTEGER DEFAULT 0,
  bounty_credits_earned INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);
