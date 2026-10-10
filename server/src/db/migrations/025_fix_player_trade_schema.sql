-- Migration 025: Fix player_trade_offers / player_trade_history schema drift
--
-- playerTradingService.ts queries these tables with the migration 022 layout
-- (initiator_player_id, recipient_player_id, sector_id, status, ...), but
-- schema.sql created the legacy layout (initiator_id, target_id). Migration
-- 022 defined the new layout with CREATE TABLE IF NOT EXISTS, which is a
-- silent no-op on databases built from schema.sql, so the old tables survived
-- and trade endpoints failed at runtime with:
--   column "initiator_player_id" does not exist.
--
-- This migration transforms the existing tables in place. It is idempotent:
-- safe to run on databases that already have the new layout.

-- player_trade_offers: rename legacy columns to the migration 022 names
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_trade_offers' AND column_name = 'initiator_id'
  ) THEN
    ALTER TABLE player_trade_offers RENAME COLUMN initiator_id TO initiator_player_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_trade_offers' AND column_name = 'target_id'
  ) THEN
    ALTER TABLE player_trade_offers RENAME COLUMN target_id TO recipient_player_id;
  END IF;
END $$;

ALTER TABLE player_trade_offers ADD COLUMN IF NOT EXISTS sector_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE;
ALTER TABLE player_trade_offers ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE player_trade_offers ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE player_trade_offers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- player_trade_history: rename legacy columns to the migration 022 names
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_trade_history' AND column_name = 'initiator_id'
  ) THEN
    ALTER TABLE player_trade_history RENAME COLUMN initiator_id TO initiator_player_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_trade_history' AND column_name = 'target_id'
  ) THEN
    ALTER TABLE player_trade_history RENAME COLUMN target_id TO recipient_player_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_trade_history' AND column_name = 'fuel_traded'
  ) THEN
    ALTER TABLE player_trade_history RENAME COLUMN fuel_traded TO fuel_transferred;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_trade_history' AND column_name = 'organics_traded'
  ) THEN
    ALTER TABLE player_trade_history RENAME COLUMN organics_traded TO organics_transferred;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_trade_history' AND column_name = 'equipment_traded'
  ) THEN
    ALTER TABLE player_trade_history RENAME COLUMN equipment_traded TO equipment_transferred;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_trade_history' AND column_name = 'credits_traded'
  ) THEN
    ALTER TABLE player_trade_history RENAME COLUMN credits_traded TO credits_transferred;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'player_trade_history' AND column_name = 'trade_type'
  ) THEN
    ALTER TABLE player_trade_history RENAME COLUMN trade_type TO action;
  END IF;
END $$;

ALTER TABLE player_trade_history ADD COLUMN IF NOT EXISTS offer_id INTEGER REFERENCES player_trade_offers(id) ON DELETE CASCADE;
ALTER TABLE player_trade_history ADD COLUMN IF NOT EXISTS sector_id INTEGER REFERENCES sectors(id) ON DELETE CASCADE;

-- Indexes matching the intent of migration 022
CREATE INDEX IF NOT EXISTS idx_player_trade_offers_initiator_pending
  ON player_trade_offers(initiator_player_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_player_trade_offers_recipient_pending
  ON player_trade_offers(recipient_player_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_player_trade_offers_universe
  ON player_trade_offers(universe_id);
CREATE INDEX IF NOT EXISTS idx_player_trade_offers_expires_pending
  ON player_trade_offers(expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_player_trade_offers_sector_pending
  ON player_trade_offers(sector_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_player_trade_offers_created
  ON player_trade_offers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_trade_history_initiator
  ON player_trade_history(initiator_player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_trade_history_recipient
  ON player_trade_history(recipient_player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_trade_history_universe
  ON player_trade_history(universe_id);
CREATE INDEX IF NOT EXISTS idx_player_trade_history_offer
  ON player_trade_history(offer_id);
