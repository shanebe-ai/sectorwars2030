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

See [server/src/db/schema.sql](server/src/db/schema.sql) for complete schema.

## Game Features

### Core Game Mechanics
- **Turn-based gameplay** - Limited turns per day with automatic regeneration
- **Turn regeneration** - Turns restore gradually over time (turns_per_day / 24 per hour)
- **Space trading** - Buy/sell fuel, organics, equipment at ports
- **Port types** - 8 port configurations for strategic trading routes
- **Ship progression** - From Scout to Corporate Flagship
- **Warp drive misfire** - 0.25% chance of malfunction sending you to a random sector
- **Ship communications** - Message other ships in your sector, stored for offline players
- **Combat system** - Attack other players and aliens (coming soon)
- **Planets** - ~30 claimable planets per universe, colonize and produce resources
- **Corporations** - Form alliances with other players
- **Territory control** - Deploy fighters and mines

### Modern Enhancements
- **Web-based interface** - Accessible from any browser
- **Real-time updates** - See other players' actions via WebSockets
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
  - [x] 11 tests for navigation and player creation
  - [x] Run with: `cd server && npm test`

### In Progress 🚧
- [ ] Combat system (attack, defend, loot)
- [ ] Planet colonization (claim, colonists, production)
- [ ] Ship upgrade system
- [ ] Corporation/alliance system
- [ ] Real-time WebSocket events

## Running Tests

```bash
cd server
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

## Documentation

- **PROJECT_STATUS.md** - Detailed development status and session context
- **IDEAS.md** - Brainstorming and future feature ideas
- **server/DATABASE_SETUP.md** - Database configuration guide

## License

MIT

## Credits

Inspired by TradeWars 2002 by Gary Martin - the legendary BBS space trading game that defined the genre.
