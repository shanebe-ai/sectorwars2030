-- Migration: Alien Trading System
-- Description: Adds tables and functionality for trading with alien ships
-- Date: 2025-12-11

-- Alien Trade Offers Table
-- Tracks active trade offers between players and alien ships
CREATE TABLE IF NOT EXISTS alien_trade_offers (
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

-- Indexes for performance
CREATE INDEX idx_alien_trade_offers_player ON alien_trade_offers(player_id) WHERE status = 'pending';
CREATE INDEX idx_alien_trade_offers_alien_ship ON alien_trade_offers(alien_ship_id) WHERE status = 'pending';
CREATE INDEX idx_alien_trade_offers_universe ON alien_trade_offers(universe_id);
CREATE INDEX idx_alien_trade_offers_expires ON alien_trade_offers(expires_at) WHERE status = 'pending';
CREATE INDEX idx_alien_trade_offers_status ON alien_trade_offers(status);

-- Alien Trade History Table
-- Logs all completed alien trades for analytics and player history
CREATE TABLE IF NOT EXISTS alien_trade_history (
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

-- Indexes for history queries
CREATE INDEX idx_alien_trade_history_player ON alien_trade_history(player_id);
CREATE INDEX idx_alien_trade_history_universe ON alien_trade_history(universe_id);
CREATE INDEX idx_alien_trade_history_alien_ship ON alien_trade_history(alien_ship_id);
CREATE INDEX idx_alien_trade_history_traded_at ON alien_trade_history(traded_at DESC);
CREATE INDEX idx_alien_trade_history_robbery ON alien_trade_history(was_robbery) WHERE was_robbery = TRUE;

-- Function to automatically expire old alien trade offers
CREATE OR REPLACE FUNCTION expire_alien_trade_offers()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE alien_trade_offers
    SET status = 'expired',
        completed_at = NOW()
    WHERE status = 'pending'
      AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO expired_count FROM expired;

  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE alien_trade_offers IS 'Active trade offers between players and alien ships with 5-minute expiry';
COMMENT ON TABLE alien_trade_history IS 'Complete history of all alien trades including robberies';
COMMENT ON COLUMN alien_trade_offers.price_modifier IS 'Alignment-based price adjustment (friendlier aliens = better prices, 0.9-1.1 range)';
COMMENT ON COLUMN alien_trade_offers.status IS 'Trade status: pending (active), accepted (completed), expired (timed out), cancelled (player cancelled), robbed (robbery attempted)';
COMMENT ON COLUMN alien_trade_history.outcome IS 'Trade result: completed (normal), robbery_success (player stole cargo), robbery_combat (robbery triggered fight)';
COMMENT ON FUNCTION expire_alien_trade_offers IS 'Cleanup function to mark expired offers - run via cron every minute';
