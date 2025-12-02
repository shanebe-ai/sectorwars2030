-- Migration 015: Sector Fighter Maintenance System
-- Adds maintenance cost tracking for deployed fighters

ALTER TABLE sector_fighters ADD COLUMN IF NOT EXISTS last_maintenance TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

COMMENT ON COLUMN sector_fighters.last_maintenance IS 'Last time maintenance was charged (₡5 per fighter per day)';

