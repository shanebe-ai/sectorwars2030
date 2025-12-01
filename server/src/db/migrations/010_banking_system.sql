-- Migration 010: Banking System
-- Add banking functionality to StarDocks

-- ============================================================================
-- BANK ACCOUNTS
-- ============================================================================
-- Supports both personal and corporate accounts

CREATE TABLE bank_accounts (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  account_type VARCHAR(20) NOT NULL, -- 'personal' or 'corporate'
  player_id INTEGER REFERENCES players(id) ON DELETE CASCADE, -- For personal accounts
  corp_id INTEGER REFERENCES corporations(id) ON DELETE CASCADE, -- For corporate accounts
  balance BIGINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_account_type CHECK (account_type IN ('personal', 'corporate')),
  CONSTRAINT check_balance_non_negative CHECK (balance >= 0),
  -- Ensure either player_id or corp_id is set, but not both
  CONSTRAINT check_account_owner CHECK (
    (account_type = 'personal' AND player_id IS NOT NULL AND corp_id IS NULL) OR
    (account_type = 'corporate' AND corp_id IS NOT NULL AND player_id IS NULL)
  ),
  -- Unique constraint: one personal account per player, one corporate account per corp
  UNIQUE(player_id),
  UNIQUE(corp_id)
);

CREATE INDEX idx_bank_accounts_player ON bank_accounts(player_id);
CREATE INDEX idx_bank_accounts_corp ON bank_accounts(corp_id);
CREATE INDEX idx_bank_accounts_universe ON bank_accounts(universe_id);

-- ============================================================================
-- BANK TRANSACTIONS
-- ============================================================================
-- Transaction log for all banking operations

CREATE TABLE bank_transactions (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER REFERENCES universes(id) ON DELETE CASCADE,
  account_id INTEGER REFERENCES bank_accounts(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL, -- 'deposit', 'withdraw', 'transfer_in', 'transfer_out'
  amount BIGINT NOT NULL,
  balance_before BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  -- For transfers
  related_account_id INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
  related_player_name VARCHAR(100), -- Cached for display
  related_corp_name VARCHAR(100), -- Cached for display
  memo TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT check_transaction_type CHECK (transaction_type IN ('deposit', 'withdraw', 'transfer_in', 'transfer_out')),
  CONSTRAINT check_amount_positive CHECK (amount > 0)
);

CREATE INDEX idx_bank_transactions_account ON bank_transactions(account_id);
CREATE INDEX idx_bank_transactions_universe ON bank_transactions(universe_id);
CREATE INDEX idx_bank_transactions_created ON bank_transactions(created_at DESC);

-- ============================================================================
-- SECTOR REGIONS (for TerraSpace labeling)
-- ============================================================================
-- Add region name to sectors

ALTER TABLE sectors ADD COLUMN region VARCHAR(50);

-- Create index for region queries
CREATE INDEX idx_sectors_region ON sectors(region);

COMMENT ON COLUMN sectors.region IS 'Region name (e.g., TerraSpace for sectors 1-10)';
