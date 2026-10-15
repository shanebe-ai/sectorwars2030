-- Migration 029: Bounties tables
-- Description: Adds bounty contracts and hunter stats for the bounties feature.
-- Date: 2026-10-15

CREATE TABLE IF NOT EXISTS bounties (
  id SERIAL PRIMARY KEY,
  universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
  target_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  placer_player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount >= 5000),
  signed BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'claimed', 'expired', 'refunded')),
  claimed_by_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  claimed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '7 days',
  CHECK (target_player_id != placer_player_id)
);

CREATE INDEX IF NOT EXISTS idx_bounties_target ON bounties(target_player_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_bounties_status ON bounties(status);
CREATE INDEX IF NOT EXISTS idx_bounties_expires ON bounties(expires_at) WHERE status = 'active';

-- Hunter lifetime stats, one row per player.
CREATE TABLE IF NOT EXISTS bounty_hunters (
  player_id INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  bounties_claimed INTEGER DEFAULT 0,
  bounty_credits_earned INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);
