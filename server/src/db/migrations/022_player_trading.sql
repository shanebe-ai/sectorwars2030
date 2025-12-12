/**
 * Player-to-Player Trading Migration
 *
 * Creates tables and functions for player-to-player trading system:
 * - player_trade_offers: Active and historical trade offers between players
 * - player_trade_history: Immutable audit log of all trade actions
 * - Auto-expiry function for 24-hour offer expiration
 */

-- =====================================================
-- Table: player_trade_offers
-- =====================================================
CREATE TABLE IF NOT EXISTS player_trade_offers (
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

-- =====================================================
-- Table: player_trade_history
-- =====================================================
CREATE TABLE IF NOT EXISTS player_trade_history (
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
  ON player_trade_history(universe_id, created_at DESC);

CREATE INDEX idx_player_trade_history_offer
  ON player_trade_history(offer_id);

-- =====================================================
-- Function: Auto-expire player trade offers
-- =====================================================
CREATE OR REPLACE FUNCTION expire_player_trade_offers()
RETURNS void AS $$
BEGIN
  -- Update all pending offers that have passed their expiration time
  UPDATE player_trade_offers
  SET
    status = 'expired',
    updated_at = CURRENT_TIMESTAMP
  WHERE
    status = 'pending'
    AND expires_at < CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Function: Validate pending offer limit
-- =====================================================
-- Prevents spam by limiting pending offers per player
CREATE OR REPLACE FUNCTION check_pending_offer_limit()
RETURNS TRIGGER AS $$
DECLARE
  pending_count INTEGER;
BEGIN
  -- Count pending offers for initiator
  SELECT COUNT(*) INTO pending_count
  FROM player_trade_offers
  WHERE initiator_player_id = NEW.initiator_player_id
    AND status = 'pending';

  -- Reject if limit exceeded (10 pending offers)
  IF pending_count >= 10 THEN
    RAISE EXCEPTION 'Player has reached maximum pending offers limit (10)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce pending offer limit
CREATE TRIGGER trigger_check_pending_offer_limit
  BEFORE INSERT ON player_trade_offers
  FOR EACH ROW
  EXECUTE FUNCTION check_pending_offer_limit();

-- =====================================================
-- Comments for documentation
-- =====================================================
COMMENT ON TABLE player_trade_offers IS 'Player-to-player trade offers with 24-hour expiration';
COMMENT ON TABLE player_trade_history IS 'Immutable audit log of all player trade actions';
COMMENT ON FUNCTION expire_player_trade_offers() IS 'Auto-expires pending offers past their expiration time';
COMMENT ON FUNCTION check_pending_offer_limit() IS 'Prevents players from creating more than 10 pending offers';
