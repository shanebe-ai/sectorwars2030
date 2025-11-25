# TradeWars 2002 Recreation

A modern web-based recreation of the classic BBS game TradeWars 2002, featuring ASCII art, cyberpunk aesthetics, and multiplayer turn-based gameplay.

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

### Classic TradeWars Mechanics
- **Turn-based gameplay** - Limited turns per day
- **Space trading** - Buy/sell fuel, organics, equipment
- **Port types** - 8 classic port configurations (BBS, BSB, etc.)
- **Ship progression** - From Scout to Corporate Flagship
- **Combat system** - Attack other players and aliens
- **Planets** - Colonize and produce resources
- **Corporations** - Form alliances with other players
- **Territory control** - Deploy fighters and mines

### Modern Enhancements
- **Web-based interface** - Accessible from any browser
- **Real-time updates** - See other players' actions via WebSockets
- **Cyberpunk aesthetics** - Neon colors and ASCII art
- **Admin panel** - Configure universes without SQL
- **Responsive design** - Play on desktop or mobile

## Port Types (Classic TradeWars)

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

- [x] Project structure setup
- [x] Database schema design
- [x] Server initialization
- [x] Shared types
- [ ] PostgreSQL migrations
- [ ] Admin panel UI
- [ ] ASCII art component library
- [ ] Authentication system
- [ ] Universe generation service
- [ ] Sector navigation
- [ ] Trading system
- [ ] Combat system
- [ ] Planet management
- [ ] Corporation system
- [ ] Real-time WebSocket events

## License

MIT

## Credits

Original TradeWars 2002 by Gary Martin
