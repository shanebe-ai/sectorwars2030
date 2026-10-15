-- Migration 030: Add missing expire_alien_trade_offers function
-- Description: The function was defined in migration 021 but never added to
-- schema.sql, so fresh databases built via db:migrate were missing it.
-- This adds it for existing databases; schema.sql now includes it for new ones.
-- Date: 2026-10-15

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
