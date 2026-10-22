-- Migration 037: Trade Boom dynamic event
-- Description: Allows trade_boom as a fourth dynamic event type. A boom
-- raises what ports in a region of linked sectors pay for one commodity.
-- The price effect is computed live from the active event row, so no
-- new columns or tables are needed; the commodity lives in params.
-- Date: 2026-10-22

-- Swap the type CHECK for one that includes trade_boom. Dropping first
-- keeps the migration safe to run more than once.
ALTER TABLE dynamic_events DROP CONSTRAINT IF EXISTS dynamic_events_type_check;
ALTER TABLE dynamic_events ADD CONSTRAINT dynamic_events_type_check
  CHECK (type IN ('ion_storm', 'incursion', 'port_strike', 'trade_boom'));

-- Grants restated so the app role keeps full access after the change.
GRANT ALL ON dynamic_events TO PUBLIC;
GRANT ALL ON SEQUENCE dynamic_events_id_seq TO PUBLIC;
