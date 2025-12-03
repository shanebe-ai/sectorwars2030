-- Migration 016: Alien System
-- Adds alien planets and alien ships to the game

-- Alien planets: NPC-controlled planets that produce resources and defend themselves
CREATE TABLE IF NOT EXISTS alien_planets (
    id SERIAL PRIMARY KEY,
    universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    sector_number INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    alien_race VARCHAR(50) NOT NULL, -- e.g., "Xenthi", "Vorlak", "Krynn"
    citadel_level INTEGER DEFAULT 3 CHECK (citadel_level >= 0 AND citadel_level <= 5),
    colonists INTEGER DEFAULT 50000, -- Aliens have substantial populations
    fighters INTEGER DEFAULT 1000, -- Defended planets
    fuel INTEGER DEFAULT 10000,
    organics INTEGER DEFAULT 10000,
    equipment INTEGER DEFAULT 10000,
    production_type VARCHAR(20) DEFAULT 'balanced' CHECK (production_type IN ('fuel', 'organics', 'equipment', 'balanced')),
    last_production_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(universe_id, sector_number)
);

CREATE INDEX idx_alien_planets_universe ON alien_planets(universe_id);
CREATE INDEX idx_alien_planets_sector ON alien_planets(universe_id, sector_number);

-- Alien ships: AI-controlled ships that patrol, trade, and attack players
CREATE TABLE IF NOT EXISTS alien_ships (
    id SERIAL PRIMARY KEY,
    universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    alien_race VARCHAR(50) NOT NULL,
    ship_name VARCHAR(100) NOT NULL,
    ship_type_id INTEGER NOT NULL REFERENCES ship_types(id),
    current_sector INTEGER NOT NULL,
    credits INTEGER DEFAULT 50000,
    cargo_fuel INTEGER DEFAULT 0,
    cargo_organics INTEGER DEFAULT 0,
    cargo_equipment INTEGER DEFAULT 0,
    fighters INTEGER DEFAULT 50,
    shields INTEGER DEFAULT 50,
    alignment INTEGER DEFAULT -200, -- Aliens are hostile
    kills INTEGER DEFAULT 0,
    behavior VARCHAR(20) DEFAULT 'patrol' CHECK (behavior IN ('patrol', 'trade', 'aggressive', 'defensive')),
    home_sector INTEGER, -- Sector they patrol around (for alien planet defense)
    last_move_at TIMESTAMP DEFAULT NOW(),
    last_action_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_alien_ships_universe ON alien_ships(universe_id);
CREATE INDEX idx_alien_ships_sector ON alien_ships(universe_id, current_sector);
CREATE INDEX idx_alien_ships_behavior ON alien_ships(behavior);

-- Alien communications: Messages broadcast by the alien network
CREATE TABLE IF NOT EXISTS alien_communications (
    id SERIAL PRIMARY KEY,
    universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    alien_race VARCHAR(50),
    message_type VARCHAR(30) NOT NULL CHECK (message_type IN (
        'encounter', 'combat', 'death', 'escape_pod', 'sector_entry',
        'planet_attack', 'port_visit', 'beacon_attack', 'threat'
    )),
    message TEXT NOT NULL,
    sector_number INTEGER,
    related_player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
    related_ship_id INTEGER REFERENCES alien_ships(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_alien_comms_universe ON alien_communications(universe_id);
CREATE INDEX idx_alien_comms_created ON alien_communications(created_at DESC);

-- Track when players unlock alien communications (after visiting alien planet sector)
CREATE TABLE IF NOT EXISTS player_alien_unlocks (
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    universe_id INTEGER NOT NULL REFERENCES universes(id) ON DELETE CASCADE,
    unlocked_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (player_id, universe_id)
);

CREATE INDEX idx_player_alien_unlocks ON player_alien_unlocks(player_id);

-- Add column to track alien encounter status
ALTER TABLE players ADD COLUMN IF NOT EXISTS has_alien_comms BOOLEAN DEFAULT FALSE;

COMMENT ON TABLE alien_planets IS 'NPC alien-controlled planets with defenses and production';
COMMENT ON TABLE alien_ships IS 'AI-controlled ships that patrol, trade, and attack';
COMMENT ON TABLE alien_communications IS 'Alien network messages visible to players who have unlocked the channel';
COMMENT ON TABLE player_alien_unlocks IS 'Tracks which players have discovered the alien communications channel';
