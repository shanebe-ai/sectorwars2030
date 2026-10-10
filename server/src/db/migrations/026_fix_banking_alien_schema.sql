-- Migration 026: Fix bank_accounts / alien_ships schema drift
--
-- The service code queries columns that schema.sql never defined:
--   * bankingService.ts uses bank_accounts.updated_at (defined in
--     migration 010's CREATE TABLE, but schema.sql has an older layout)
--   * alienTradingService.ts uses alien_ships cargo/alignment columns
--     (added by migration 022_fix_alien_ships_schema.sql via ALTER TABLE,
--     never merged back into schema.sql)
-- schema.sql now carries the full definitions; this migration repairs
-- existing databases in place. Idempotent: safe to run more than once.

-- bank_accounts: updated_at from migration 010
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- bank_transactions: columns from migration 010 missing in schema.sql
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS balance_before BIGINT NOT NULL DEFAULT 0;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS related_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS related_player_name VARCHAR(100);
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS related_corp_name VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_universe ON bank_transactions(universe_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_created ON bank_transactions(created_at DESC);

-- alien_trade_offers: full layout from migration 021 (schema.sql had an older shape)
ALTER TABLE alien_trade_offers ADD COLUMN IF NOT EXISTS alien_offers_fuel INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alien_trade_offers ADD COLUMN IF NOT EXISTS alien_offers_organics INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alien_trade_offers ADD COLUMN IF NOT EXISTS alien_offers_equipment INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alien_trade_offers ADD COLUMN IF NOT EXISTS alien_offers_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alien_trade_offers ADD COLUMN IF NOT EXISTS alien_requests_fuel INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alien_trade_offers ADD COLUMN IF NOT EXISTS alien_requests_organics INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alien_trade_offers ADD COLUMN IF NOT EXISTS alien_requests_equipment INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alien_trade_offers ADD COLUMN IF NOT EXISTS alien_requests_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alien_trade_offers ADD COLUMN IF NOT EXISTS alien_alignment INTEGER;
ALTER TABLE alien_trade_offers ADD COLUMN IF NOT EXISTS price_modifier DECIMAL(5,2) NOT NULL DEFAULT 1.0;
ALTER TABLE alien_trade_offers ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE alien_trade_offers ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_alien_trade_offers_player ON alien_trade_offers(player_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_alien_trade_offers_alien_ship ON alien_trade_offers(alien_ship_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_alien_trade_offers_universe ON alien_trade_offers(universe_id);
CREATE INDEX IF NOT EXISTS idx_alien_trade_offers_expires ON alien_trade_offers(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_alien_trade_offers_status ON alien_trade_offers(status);

-- alien_trade_history: full layout from migration 021
ALTER TABLE alien_trade_history ADD COLUMN IF NOT EXISTS fuel_traded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alien_trade_history ADD COLUMN IF NOT EXISTS organics_traded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alien_trade_history ADD COLUMN IF NOT EXISTS equipment_traded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alien_trade_history ADD COLUMN IF NOT EXISTS credits_traded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE alien_trade_history ADD COLUMN IF NOT EXISTS outcome VARCHAR(20);
ALTER TABLE alien_trade_history ADD COLUMN IF NOT EXISTS was_robbery BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE alien_trade_history ADD COLUMN IF NOT EXISTS robber_id INTEGER REFERENCES players(id) ON DELETE SET NULL;
ALTER TABLE alien_trade_history ADD COLUMN IF NOT EXISTS alien_race VARCHAR(50);
ALTER TABLE alien_trade_history ADD COLUMN IF NOT EXISTS alien_alignment INTEGER;
ALTER TABLE alien_trade_history ADD COLUMN IF NOT EXISTS sector_number INTEGER;
ALTER TABLE alien_trade_history ADD COLUMN IF NOT EXISTS traded_at TIMESTAMP NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_alien_trade_history_player ON alien_trade_history(player_id);
CREATE INDEX IF NOT EXISTS idx_alien_trade_history_universe ON alien_trade_history(universe_id);
CREATE INDEX IF NOT EXISTS idx_alien_trade_history_alien_ship ON alien_trade_history(alien_ship_id);
CREATE INDEX IF NOT EXISTS idx_alien_trade_history_traded_at ON alien_trade_history(traded_at DESC);
CREATE INDEX IF NOT EXISTS idx_alien_trade_history_robbery ON alien_trade_history(was_robbery) WHERE was_robbery = TRUE;

-- alien_ships: columns from migration 022_fix_alien_ships_schema.sql
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS ship_name VARCHAR(100);
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS current_sector INTEGER;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 50000;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS cargo_fuel INTEGER DEFAULT 0;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS cargo_organics INTEGER DEFAULT 0;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS cargo_equipment INTEGER DEFAULT 0;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS alignment INTEGER DEFAULT -200;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS kills INTEGER DEFAULT 0;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS home_sector INTEGER;
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS last_move_at TIMESTAMP DEFAULT NOW();
ALTER TABLE alien_ships ADD COLUMN IF NOT EXISTS last_action_at TIMESTAMP DEFAULT NOW();

-- Backfill for pre-existing rows (same as 022_fix_alien_ships_schema.sql)
UPDATE alien_ships SET current_sector = sector_number WHERE current_sector IS NULL;
UPDATE alien_ships
SET ship_name = alien_race || ' Vessel #' || id
WHERE ship_name IS NULL;

CREATE INDEX IF NOT EXISTS idx_alien_ships_current_sector ON alien_ships(universe_id, current_sector);
CREATE INDEX IF NOT EXISTS idx_alien_ships_behavior ON alien_ships(behavior);
