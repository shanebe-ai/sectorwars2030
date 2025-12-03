-- Migration 017: Add ALIEN_PLANET log type to ship logs
-- Allows ship logs to track alien planet discoveries

-- Drop the existing constraint
ALTER TABLE ship_logs DROP CONSTRAINT IF EXISTS ship_logs_log_type_check;

-- Add the new constraint with ALIEN_PLANET included
ALTER TABLE ship_logs ADD CONSTRAINT ship_logs_log_type_check 
  CHECK (log_type IN ('SOL', 'PLANET', 'PORT', 'DEAD_END', 'STARDOCK', 'MANUAL', 'ALIEN_PLANET'));

-- Update the comment
COMMENT ON COLUMN ship_logs.log_type IS 'SOL=starting sector, PLANET=planet found, PORT=trading port, DEAD_END=no exits, STARDOCK=ship dealer, MANUAL=player note, ALIEN_PLANET=alien-controlled planet';


