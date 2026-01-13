# TradeWars 2030

A modern web-based multiplayer space trading game featuring ASCII art, cyberpunk aesthetics, and turn-based gameplay.

## Project Structure

```
/home/helloai/
├── client/          # Player frontend (React + Vite + TypeScript)
├── admin/           # Admin panel (React + Vite + TypeScript)
├── server/          # Backend API (Node.js + Express + TypeScript)
└── shared/          # Shared TypeScript types and constants
```

## Tech Stack

### Frontend (Client & Admin)
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **CSS** - Cyberpunk-themed styling with ASCII art

### Backend (Server)
- **Node.js + Express** - REST API server
- **TypeScript** - Type-safe backend code
- **Socket.io** - Real-time WebSocket communication
- **PostgreSQL** - Robust relational database
- **JWT** - Authentication
- **bcrypt** - Password hashing

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Database Setup

1. Create the PostgreSQL database:
```bash
createdb tradewars
```

2. Run the schema:
```bash
cd server
psql tradewars < src/db/schema.sql
```

3. Configure environment:
```bash
cp server/.env.example server/.env
# Edit server/.env with your database credentials
```

### Server Setup

```bash
cd server
npm install
npm run dev
```

Server runs on http://localhost:3000

### Client Setup

```bash
cd client
npm install
npm run dev
```

Client runs on http://localhost:5173

### Admin Panel Setup

```bash
cd admin
npm install
npm run dev
```

Admin panel runs on http://localhost:5174

## Database Schema

### Core Tables
- **users** - Player accounts and authentication
- **universes** - Game universe configurations
- **players** - Player game state (ships, cargo, credits, turns)
- **sectors** - Universe sectors with ports and connections
- **sector_warps** - Warp connections between sectors
- **planets** - Player-owned planets
- **ship_types** - Available ship configurations
- **corporations** - Team/alliance system
- **game_events** - Historical event log
- **combat_log** - Combat history
- **alien_planets** - Alien planet locations and details
- **alien_ships** - Alien ship configurations and positions
- **alien_communications** - Alien message history
- **player_alien_unlocks** - Tracks which players have unlocked alien comms

See [server/src/db/schema.sql](server/src/db/schema.sql) for complete schema.

## Game Features

### Core Game Mechanics
- **Turn-based gameplay** - Limited turns per day with automatic regeneration
- **Turn regeneration** - Turns restore gradually over time (turns_per_day / 24 per hour)
- **Space trading** - Buy/sell fuel, organics, equipment at ports
- **Port types** - 8 port configurations for strategic trading routes
- **Ship progression** - 10 ships from Escape Pod to Dreadnought
- **TW2002-style warp ranges** - Constrained warp destinations (±50-200 sectors) create natural trade routes and strategic territory
- **Warp drive misfire** - 0.25% chance of malfunction sending you to a random sector
- **TerraSpace safe zone** - Protected starting area (2% of universe, minimum 10 sectors) where aggressive aliens cannot enter
- **Plot Course** - Auto-navigation with smart pause at points of interest
- **Ship communications** - Direct messages, broadcasts, and corporate chat
- **Combat system** - Attack players and aliens (1 turn, 75% loot, 25% death penalty)
- **Planets** - ~30 claimable planets per universe, colonize and produce resources
  - Earth (Sol, Sector 1) and Mars (last TerraSpace sector) owned by Terra Corp
  - Citadel defense system (6 levels with production bonuses)
  - Resource production based on colonist population
  - Fighter deployment and credit treasury
- **Banking System** - StarDock-based banking with personal and corporate accounts
  - 5% withdrawal fee, 25% bank balance lost on death
  - Corporate withdrawal limits by rank
- **Alien System** - NPC adversaries with AI behaviors
  - Alien planets scale with universe size (0.3% formula for 1000+ sectors)
  - Alien ships with balanced behavior distribution (40% trade, 30% patrol, 20% aggressive, 10% defensive)
  - Alignment system affects alien interactions: traders are friendly, raiders are hostile
  - TerraSpace protection: aggressive/patrol/defensive aliens cannot enter, but trade aliens can
  - Alien communications channel (read-only), unlocked after visiting an alien planet
  - Alien ships move and attack automatically via game tick system
  - Combat with aliens for credits and cargo (strategic choice: attack traders or build relationships)
- **Corporations** - Form alliances with other players
  - Ranks: Founder, Officer, Member
  - Invite system, kick members, promote/demote
  - Corporate chat channel for alliance coordination
- **Territory control** - Deploy fighters and mines
  - Fighter maintenance: ₡5/fighter/day
  - Mines: ₡10,000 each, 75-225 damage per explosion
  - Beacons: Personal markers with custom messages
- **Genesis Torpedoes** - Create new planets anywhere (₡50,000 each)
- **Ship Log** - Auto-logging of discoveries (ports, planets, StarDocks, dead-ends)

### Modern Enhancements
- **Web-based interface** - Accessible from any browser
- **Real-time updates** - See other players' actions via WebSockets
  - Player movement, combat, trading, planet colonization
  - Alien encounters and communications
  - Genesis torpedo launches, beacon messages
- **Cyberpunk aesthetics** - Neon colors and ASCII art
- **Admin panel** - Configure universes without SQL
- **Responsive design** - Play on desktop or mobile

## Port Types

Each letter represents commodity availability:
- **B** = Buying (port buys from you)
- **S** = Selling (port sells to you)

Format: `[Fuel][Organics][Equipment]`

- **BBS** - Buys Fuel, Buys Organics, Sells Equipment
- **BSB** - Buys Fuel, Sells Organics, Buys Equipment
- **SBB** - Sells Fuel, Buys Organics, Buys Equipment
- **SSB** - Sells Fuel, Sells Organics, Buys Equipment
- **SBS** - Sells Fuel, Buys Organics, Sells Equipment
- **BSS** - Buys Fuel, Sells Organics, Sells Equipment
- **SSS** - Sells all commodities (rare)
- **BBB** - Buys all commodities (rare)

## Development Roadmap

### Completed ✅
- [x] Project structure setup
- [x] Database schema design and migrations
- [x] Server initialization
- [x] Shared TypeScript types
- [x] Authentication system (JWT + bcrypt)
- [x] User registration and login API
- [x] Admin authorization middleware
- [x] Universe generation service (with ~3% planets, 12% ports)
- [x] Ship types system
- [x] **Admin Panel (Port 5174)**
  - [x] Purple cyberpunk theme
  - [x] Universe creation UI with defaults
  - [x] Universe management dashboard
  - [x] Toggle slider for dead-end sectors
- [x] **Player Initialization System**
  - [x] Player creation API
  - [x] Starting ship assignment
  - [x] Credits and sector placement
  - [x] Reserved corporation names (Terra Corp)
- [x] **Sector Navigation System**
  - [x] GET /api/sectors/:sectorNumber - Sector details with warps
  - [x] POST /api/sectors/move - Move player between sectors
  - [x] Turn consumption (1 turn per move)
  - [x] Bidirectional warp connections
  - [x] SectorView component with ASCII art
  - [x] Warp drive misfire system (0.25% chance of malfunction)
  - [x] Visited sector tracking with visual indicators
  - [x] Previous sector navigation (◄ marker)
- [x] **Port Trading System**
  - [x] GET /api/ports/:sectorNumber - Port details and prices
  - [x] POST /api/ports/trade - Buy/sell commodities
  - [x] Dynamic pricing based on port percentage
  - [x] PortTradingPanel with cyberpunk UI
  - [x] Cargo manifest display
- [x] **Turn Regeneration System**
  - [x] Gradual turn regeneration (turns_per_day / 24 per hour)
  - [x] Automatic regeneration on player data fetch
  - [x] Capped at universe's turns_per_day setting
- [x] **Ship Communications System**
  - [x] Send messages to other ships in your sector
  - [x] Messages stored in "ship computer" for offline players
  - [x] Inbox/Sent message views
  - [x] Unread message count badge
  - [x] Reply and delete functionality
- [x] **Automated Testing**
  - [x] Jest + ts-jest framework
  - [x] 17 tests total (navigation, player creation, banking, combat)
  - [x] Run with: `cd server && npm test`
- [x] **Economy & Combat Rebalancing (2025-12-02)**
  - [x] Banking system fixes (StarDock requirement, 5% withdrawal fee, death penalty on bank balance)
  - [x] Combat improvements (1 turn cost, 75% loot, 25% death penalty)
  - [x] Fighter maintenance system (₡5/fighter/day, auto-destruction on non-payment)
  - [x] Planet production buff (5x rates, citadel bonuses)
  - [x] Corporate account withdrawal limits (founder/officer/member tiers)
  - [x] Ship cost database fixes
- [x] **UI Improvements**
  - [x] No browser popups (prompt/alert/confirm) - all interactions use UI modals
  - [x] Real-time ship status updates (fighters update immediately on deploy/retrieve)
  - [x] Fighter maintenance cost warnings in deployment UI
- [x] **Alien System (2025-12-02, updated 2026-01-12)**
  - [x] Alien planet generation with scaling formula (0.3% for 1000+ sectors)
  - [x] Alien ship generation with multiple races and ship types
  - [x] Alien communications channel (read-only)
  - [x] Auto-unlock alien comms when entering alien planet sector
  - [x] Alien comms integrated into MessagingPanel as separate tab
  - [x] Alien ship AI movement system (game tick every 5 minutes)
  - [x] Alien ship behaviors with balanced distribution (40% trade, 30% patrol, 20% aggressive, 10% defensive)
  - [x] Alien alignment system: traders friendly (+50 to +150), patrol neutral (-50 to +50), raiders hostile (-300 to -150), guards territorial (-100)
  - [x] Alien planet detection and logging in ship log
  - [x] Admin panel configuration for alien planet count
- [x] **TW2002-Style Universe Generation (2026-01-12, updated 2026-01-13)**
  - [x] Constrained warp ranges (±50-200 sectors) instead of fully random
  - [x] Dynamic TerraSpace sizing (2% of universe, minimum 10 sectors)
  - [x] TerraSpace exit sectors use constrained ranges (no long-distance teleports)
  - [x] Mars planet at last TerraSpace sector (owned by Terra Corp)
  - [x] Alien TerraSpace restrictions (trade aliens can enter, aggressive/patrol/defensive cannot)
  - [x] Alien spawning respects dynamic TerraSpace boundaries
  - [x] Dynamic connection limits: edge sectors max 6, middle sectors max 8 (allows natural hub formation)
  - [x] Connectivity verification from actual inserted warps (prevents isolated sectors)
  - [x] Automatic connection of unreachable sectors during universe generation

### In Progress 🚧
- [ ] Player rankings and leaderboards
- [ ] Mobile responsive design improvements
- [ ] Advanced admin tools (player management, universe editing)

## Running Tests

```bash
cd server
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

## Documentation

- **PROJECT_STATUS.md** - Detailed development status and session context
- **MANUAL_TESTING_GUIDE.md** - Comprehensive manual testing procedures
- **IDEAS.md** - Brainstorming and future feature ideas
- **server/DATABASE_SETUP.md** - Database configuration guide

## License

MIT

## Credits

Inspired by TradeWars 2002 by Gary Martin - the legendary BBS space trading game that defined the genre.
