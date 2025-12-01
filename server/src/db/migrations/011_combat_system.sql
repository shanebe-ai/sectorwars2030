-- Migration 011: Combat System Enhancements
-- Adds combat-related columns and improves combat_log table

-- Add combat-related columns to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_combat_at TIMESTAMP;
ALTER TABLE players ADD COLUMN IF NOT EXISTS kills INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS deaths INTEGER DEFAULT 0;

-- Add escape pod tracking - when a player dies, they respawn in escape pod
ALTER TABLE players ADD COLUMN IF NOT EXISTS in_escape_pod BOOLEAN DEFAULT FALSE;

-- Improve combat_log table with more detailed tracking
ALTER TABLE combat_log ADD COLUMN IF NOT EXISTS rounds_fought INTEGER DEFAULT 1;
ALTER TABLE combat_log ADD COLUMN IF NOT EXISTS attacker_fighters_lost INTEGER DEFAULT 0;
ALTER TABLE combat_log ADD COLUMN IF NOT EXISTS defender_fighters_lost INTEGER DEFAULT 0;
ALTER TABLE combat_log ADD COLUMN IF NOT EXISTS attacker_shields_lost INTEGER DEFAULT 0;
ALTER TABLE combat_log ADD COLUMN IF NOT EXISTS defender_shields_lost INTEGER DEFAULT 0;
ALTER TABLE combat_log ADD COLUMN IF NOT EXISTS defender_destroyed BOOLEAN DEFAULT FALSE;
ALTER TABLE combat_log ADD COLUMN IF NOT EXISTS attacker_fled BOOLEAN DEFAULT FALSE;

-- Add index for combat history lookups
CREATE INDEX IF NOT EXISTS idx_combat_log_created ON combat_log(created_at DESC);

-- Add comments for documentation
COMMENT ON COLUMN players.last_combat_at IS 'Timestamp of last combat engagement';
COMMENT ON COLUMN players.kills IS 'Total players destroyed';
COMMENT ON COLUMN players.deaths IS 'Total times destroyed by other players';
COMMENT ON COLUMN players.in_escape_pod IS 'True if player was recently destroyed and is in escape pod';
COMMENT ON COLUMN combat_log.rounds_fought IS 'Number of combat rounds before resolution';
COMMENT ON COLUMN combat_log.defender_destroyed IS 'True if defender ship was destroyed';
COMMENT ON COLUMN combat_log.attacker_fled IS 'True if attacker retreated';

