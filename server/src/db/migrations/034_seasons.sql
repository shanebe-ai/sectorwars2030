-- Migration 034: Seasons
-- Description: Timed competitive seasons per universe. A season has a
-- start and end date; TNN warns players at 7 days, 24 hours and 1 hour
-- before it ends. When it ends the final standings are archived to a
-- Hall of Fame. Ending a season never changes or removes player ships,
-- cargo, credits or planets. A fresh start for the next season is done
-- by creating a new universe, not by wiping this one.
-- Date: 2026-10-20

CREATE TABLE IF NOT EXISTS seasons (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  season_number INTEGER NOT NULL,
  name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  starts_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMP NOT NULL,
  -- Smallest warning threshold (in hours) already announced, so each
  -- warning goes out once. Reset to NULL when the season is extended.
  last_warning_hours INTEGER,
  ended_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(universe_id, season_number)
);

-- At most one running season per universe.
CREATE UNIQUE INDEX IF NOT EXISTS idx_seasons_one_active
  ON seasons(universe_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_seasons_universe ON seasons(universe_id);

-- Final standings, copied at season end. Names are copied too so the
-- Hall of Fame survives players or universes being removed later.
CREATE TABLE IF NOT EXISTS season_standings (
  id SERIAL PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  rank INTEGER NOT NULL,
  username VARCHAR(100),
  corp_name VARCHAR(100) NOT NULL,
  ship_type VARCHAR(50),
  networth BIGINT NOT NULL DEFAULT 0,
  experience BIGINT NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  planet_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(season_id, rank)
);

CREATE INDEX IF NOT EXISTS idx_season_standings_season ON season_standings(season_id);

-- Same lesson as migrations 032 and 033: grants ship with the tables.
GRANT ALL ON seasons TO PUBLIC;
GRANT ALL ON season_standings TO PUBLIC;
GRANT ALL ON SEQUENCE seasons_id_seq TO PUBLIC;
GRANT ALL ON SEQUENCE season_standings_id_seq TO PUBLIC;
