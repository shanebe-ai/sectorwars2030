-- Migration 041: Seasons as themed chapters of one persistent world
-- Description: Nothing resets between seasons any more. A season is a
-- chapter inside the same universe: it can carry a theme (for example
-- Pirate Season, see services/seasonThemes.ts), and its standings are
-- scored on what each player gained during the chapter rather than
-- total net worth. To score gains, a snapshot of every player is taken
-- when the chapter starts (season_baselines). Chapter titles such as
-- Top Bounty Hunter are archived in season_titles.
-- Purely additive: existing seasons keep scoring 'networth', so the
-- Season 1 Hall of Fame reads exactly as before.
-- Date: 2026-11-20

ALTER TABLE seasons ADD COLUMN IF NOT EXISTS theme VARCHAR(30);
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS scoring VARCHAR(20) NOT NULL DEFAULT 'networth';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'seasons_scoring_check'
  ) THEN
    ALTER TABLE seasons ADD CONSTRAINT seasons_scoring_check CHECK (scoring IN ('networth', 'gain'));
  END IF;
END $$;

-- Net worth gain during the chapter, archived beside the final net worth.
ALTER TABLE season_standings ADD COLUMN IF NOT EXISTS gain BIGINT;

-- Snapshot of each player at chapter start (or when they joined later).
CREATE TABLE IF NOT EXISTS season_baselines (
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  networth BIGINT NOT NULL DEFAULT 0,
  bounty_credits BIGINT NOT NULL DEFAULT 0,
  bounties_claimed INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (season_id, player_id)
);

-- Chapter titles. Names are copied so the Hall of Fame survives
-- players being removed later, like season_standings.
CREATE TABLE IF NOT EXISTS season_titles (
  id SERIAL PRIMARY KEY,
  season_id INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  title_key VARCHAR(40) NOT NULL,
  title_label VARCHAR(100) NOT NULL,
  player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  username VARCHAR(100),
  corp_name VARCHAR(100) NOT NULL,
  value BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(season_id, title_key)
);

CREATE INDEX IF NOT EXISTS idx_season_titles_season ON season_titles(season_id);
CREATE INDEX IF NOT EXISTS idx_season_titles_player ON season_titles(player_id);

-- Grants ship with the tables (lesson from migration 031).
GRANT ALL ON seasons TO PUBLIC;
GRANT ALL ON season_standings TO PUBLIC;
GRANT ALL ON season_baselines TO PUBLIC;
GRANT ALL ON season_titles TO PUBLIC;
GRANT ALL ON SEQUENCE season_titles_id_seq TO PUBLIC;
