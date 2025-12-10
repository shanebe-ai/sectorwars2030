# TradeWars 2030 - Project Status

## Overview
Modern web-based multiplayer space trading game with ASCII art, cyberpunk aesthetics, and turn-based gameplay.

## Completed ✅

### 1. Project Architecture
- **Multi-app monorepo structure** established
  - `client/` - Player game frontend (React + Vite + TypeScript)
  - `admin/` - Admin configuration panel (React + Vite + TypeScript)
  - `server/` - Backend API (Node.js + Express + TypeScript + Socket.io)
  - `shared/` - Shared TypeScript types and constants

### 2. Database Design & Setup
- **PostgreSQL schema** fully designed ([server/src/db/schema.sql](server/src/db/schema.sql))
- **Database created and migrated** - All 12 tables live in production
- Core tables implemented:
  - Users & Authentication ✅
  - Universes (game instances)
  - Players (game state, ships, cargo, turns)
  - Sectors (with ports and warps)
  - Planets (colonization system)
  - Ship Types (progression system)
  - Corporations (alliances)
  - Combat & Event Logging
  - Turn Updates

### 3. Backend Infrastructure
- Express.js server with TypeScript ✅
- Socket.io for real-time multiplayer ✅
- Database connection pooling (PostgreSQL) ✅
- Environment configuration (.env) ✅
- Structured folders (routes, controllers, services, models, middleware) ✅
- **Server running on http://localhost:3000** ✅

### 4. Authentication System (FULLY WORKING!)
- **User Registration API** (`POST /api/auth/register`) ✅
  - Username, email, password validation
  - Duplicate checking
  - bcrypt password hashing (10 rounds)
  - Returns JWT token + user data
- **User Login API** (`POST /api/auth/login`) ✅
  - Credential verification
  - Password comparison with bcrypt
  - JWT token generation (7-day expiration)
  - Last login timestamp update
- **Profile API** (`GET /api/auth/profile`) ✅
  - JWT authentication middleware
  - Returns user profile data
- **JWT Implementation** ✅
  - Token contains: userId, username, email, isAdmin
  - 7-day expiration
  - HS256 signing algorithm

### 5. Client Frontend
- **Login/Registration UI** ([client/src/components/Login.tsx](client/src/components/Login.tsx)) ✅
  - Beautiful cyberpunk-themed interface
  - ASCII art TradeWars 2030 logo
  - Toggle between login/register modes
  - Form validation
  - Error handling and display
  - Neon green/purple/pink color scheme
- **Main App Component** ([client/src/App.tsx](client/src/App.tsx)) ✅
  - Authentication state management
  - JWT token storage in localStorage
  - Protected routes
  - User profile display (placeholder dashboard)
  - Logout functionality
- **Cyberpunk Styling** ✅
  - Neon colors (green, purple, pink, cyan)
  - ASCII borders and characters
  - Terminal-style UI components
- **Client running on http://localhost:5173** ✅

### 6. Shared Type System
- Complete TypeScript type definitions
- Shared between client, admin, and server
- Includes:
  - Game entities (Player, Sector, Planet, Ship, etc.)
  - API request/response types
  - WebSocket event types
  - Port type system (BBS, BSB, SBB, etc.)

### 7. Documentation
- Comprehensive README with setup instructions
- Database schema documentation
- Port type reference
- Development roadmap
- **PROJECT_STATUS.md kept up to date** ✅

### 8. Universe Generation System (FULLY WORKING!)
- **Universe Service** ([server/src/services/universeService.ts](server/src/services/universeService.ts)) ✅
  - Procedural sector generation (configurable 10-10000 sectors)
  - Automatic warp connection generation (2-6 bidirectional per sector)
  - Strategic port placement with rarity (SSS/BBB are rare 5%)
  - Transaction-safe with single DB client for atomicity
  - Sol (Earth) sector always at position 1
- **Universe API** ([server/src/controllers/universeController.ts](server/src/controllers/universeController.ts)) ✅
  - POST /api/universes - Create universe (admin only)
  - GET /api/universes - List all universes with stats
  - GET /api/universes/:id - Get specific universe
  - DELETE /api/universes/:id - Delete universe (admin only)
- **Ship Types Seeding** ([server/src/db/seedShipTypes.ts](server/src/db/seedShipTypes.ts)) ✅
  - 6 ship types: Escape Pod → Scout → Trader → Freighter → Merchant Cruiser → Corporate Flagship
  - Complete progression system with holds, combat stats, costs

### 9. Admin Panel (FULLY WORKING!)
- **Admin Application** running on http://localhost:5174 ✅
- **Purple Cyberpunk Theme** distinguishes from player client ✅
- **AdminLogin Component** ([admin/src/components/AdminLogin.tsx](admin/src/components/AdminLogin.tsx)) ✅
  - Admin-only authentication with isAdmin validation
  - Purple-themed login interface matching cyberpunk aesthetic
  - ASCII art admin panel logo
- **UniverseDashboard Component** ([admin/src/components/UniverseDashboard.tsx](admin/src/components/UniverseDashboard.tsx)) ✅
  - Grid display of all universes with real-time stats
  - Shows sectors, ports, players, turns/day for each universe
  - Delete functionality with confirmation
  - Admin header with username and logout
- **CreateUniverseModal Component** ([admin/src/components/CreateUniverseModal.tsx](admin/src/components/CreateUniverseModal.tsx)) ✅
  - Universe creation form with recommended defaults:
    - 1000 sectors, 12% port distribution
    - 100 max players, 1000 turns/day
    - 2000 starting credits, Scout ship
  - Manual override for all parameters
  - Server-side admin authorization
- **Admin Styling** ([admin/src/styles/cyberpunk.css](admin/src/styles/cyberpunk.css)) ✅
  - Purple color scheme (#9D00FF) vs client's cyan/green
  - Matching terminal aesthetic with admin branding
  - Form components, modals, and card layouts

### 10. Player Initialization System (FULLY WORKING!)
- **Player Service** ([server/src/services/playerService.ts](server/src/services/playerService.ts)) ✅
  - `createPlayer()` - Creates new player with full validation
  - `getPlayersByUser()` - Lists all players for authenticated user
  - `getPlayerById()` - Gets complete player details
  - `getPlayerByUserAndUniverse()` - Checks player in specific universe
  - `hasPlayerInUniverse()` - Quick existence check
- **Player Controller** ([server/src/controllers/playerController.ts](server/src/controllers/playerController.ts)) ✅
  - POST /api/players - Initialize new player in universe
  - GET /api/players - List all user's players with universe names
  - GET /api/players/:id - Get specific player with full details
  - GET /api/players/check/:universeId - Check player status
- **Player Initialization Features** ✅
  - Auto-assigns starting sector (first sector in universe)
  - Pulls starting credits and ship type from universe config
  - Loads ship stats (holds, fighters, shields) from ship_types
  - Transaction-safe with automatic rollback on errors
  - Validates universe capacity (max_players limit)
  - Enforces one player per user per universe (UNIQUE constraint)
  - Proper error messages for all failure cases
- **Ship Types System** ✅
  - Global ship types (universe_id NULL) for cross-universe use
  - Universe-specific ship types supported
  - Query checks both global and universe-specific types

### 11. Testing & Verification
- ✅ User registration tested via curl (successful)
- ✅ User login tested via curl (successful)
- ✅ JWT tokens generated correctly
- ✅ Database queries executing properly
- ✅ All three servers running concurrently
- ✅ End-to-end authentication flow working
- ✅ Universe generation tested (multiple universes created)
- ✅ Custom parameters working (500 sectors, 15% ports tested)
- ✅ Transaction isolation verified (no foreign key violations)
- ✅ Admin panel login/logout flow tested
- ✅ Universe CRUD operations verified end-to-end
- ✅ **Player creation tested successfully**
- ✅ **Player receives correct starting credits from universe**
- ✅ **Player assigned correct ship type with stats**
- ✅ **Player placed in starting sector**
- ✅ **GET /api/players returns player with universe name**

### 12. Sector Navigation System (FULLY WORKING!)
- **Sector Controller** ([server/src/controllers/sectorController.ts](server/src/controllers/sectorController.ts)) ✅
  - GET /api/sectors/:sectorNumber - Get sector details with warps and players
  - POST /api/sectors/move - Move player to connected sector
- **Navigation Features** ✅
  - Validates warp connections before movement
  - Consumes 1 turn per movement
  - Rejects movement when turns = 0
  - Transaction-safe with automatic rollback
  - Logs movement events to game_events table
- **Warp Drive Misfire System** ✅
  - 0.25% chance of warp drive malfunction on each jump
  - Misfire sends player to random sector instead of destination
  - Bold pulsing alert message displays on misfire
  - Screen shake effect for 3 seconds on arrival
  - Alert persists until player warps again
- **Navigation History** ✅
  - Visited sectors tracked with darker green border styling
  - Previous sector marked with ◄ indicator for easy backtracking
- **Plot Course / Pathfinding System** ✅
  - **Pathfinding Service** ([server/src/services/pathfindingService.ts](server/src/services/pathfindingService.ts))
    - BFS algorithm finds shortest path between sectors
    - Handles disconnected graphs (returns null if no path exists)
    - Returns enriched sector data (visited status, points of interest)
  - **Pathfinding Routes** ([server/src/routes/pathfinding.ts](server/src/routes/pathfinding.ts))
    - POST /api/pathfinding/plot - Calculate route to destination
  - **Plot Course UI** (integrated in SectorView)
    - Input destination sector number
    - Visual route display with color-coded sectors
    - Turn cost calculation and warnings
    - Auto-navigation with smart pause system
    - Pauses automatically at ports, planets, stardocks, ships
    - Manual pause/continue controls
    - Clear button to reset route

### 15. Ship Communications System (FULLY WORKING!)
- **Message Service** ([server/src/services/messageService.ts](server/src/services/messageService.ts)) ✅
  - `sendMessage()` - Send DIRECT or BROADCAST messages
  - `getInbox()` - Get inbox messages (direct only)
  - `getBroadcasts()` - Get universe-wide broadcasts
  - `getSentMessages()` - Get sent messages history
  - `getMessage()` - Get specific message (auto-marks as read)
  - `markAsRead()` - Mark message as read
  - `deleteMessage()` - Soft delete (per-user deletion)
  - `getUnreadCount()` - Get count of unread messages
  - `getKnownTraders()` - Get players you've encountered
  - `recordEncounter()` - Track player encounters (auto on movement)
- **Message Controller & Routes** ✅
  - POST /api/messages - Send message (direct or broadcast)
  - GET /api/messages/inbox - Get inbox messages
  - GET /api/messages/broadcasts - Get universe broadcasts
  - GET /api/messages/sent - Get sent messages
  - GET /api/messages/:id - Get specific message
  - PUT /api/messages/:id/read - Mark as read
  - DELETE /api/messages/:id - Delete message
  - GET /api/messages/unread-count - Get unread count
  - GET /api/messages/known-traders - Get traders you've met
- **MessagingPanel Component** ([client/src/components/MessagingPanel.tsx](client/src/components/MessagingPanel.tsx)) ✅
  - Inbox tab (direct messages with unread indicators)
  - Broadcasts tab (universe-wide messages in purple)
  - Sent messages tab
  - Compose tab with message type selector
  - Known traders dropdown (no location restriction)
  - Read message view with reply/delete options
  - Broadcast warning when sending to universe
  - Cyberpunk-themed modal interface
- **GameDashboard Integration** ✅
  - COMMS button in header with unread badge
  - Unread count fetched on mount
  - Real-time count updates when reading messages
- **Broadcast Improvements** ✅
  - Only shows broadcasts sent after player joined universe (no historical spam)
  - Chat-style rendering: `[BROADCAST] PilotName (CorpName): Message` with timestamp
  - Per-player deletion via `message_deletions` table (for others' broadcasts)
  - Sender deletion via `is_deleted_by_sender` (hides from both Sent and Broadcasts)
  - Delete button available in broadcast message view
  - Subject field hidden when composing/viewing broadcasts (not applicable)
  - Broadcasts in Sent show message preview instead of "(no subject)"
  - Improved date/time formatting (e.g., "Nov 27, 3:45 PM")
  - Dynamic "Back" button returns to correct tab (Inbox/Broadcasts/Sent/Corporate)
- **Corporate Messaging** ✅
  - CORPORATE message type - alliance chat for corporation members only
  - Corporate tab only visible if player is in a corporation
  - Chat-style rendering: `[CORPORATE] PilotName (CorpName): Message` with green theme
  - Per-player deletion support (same as broadcasts)
  - Auto-corporation creation: new players get their own corporation on join
  - Sent folder shows actual corp name (e.g., "To: MyCorp" not "[Corporate]")
  - Migration 005: Added `corp_id` column to messages, CORPORATE message type
- **Unread Indicators** ✅
  - COMMS button badge shows total unread count (all channels)
  - Individual tab badges: Inbox, Broadcasts, Corporate (pink badges with count)
  - `getUnreadCounts` API returns detailed counts per channel
  - Per-user read tracking via `message_reads` table (persists across sessions)
  - Opening Broadcasts/Corporate tab marks all as read in database
  - Migration 006: Added `message_reads` table for per-user read tracking
- **Player Encounters** ✅
  - Automatic tracking when players meet in sectors
  - Bidirectional encounter recording
  - Encounter count and last met timestamp
  - Enables messaging any known trader from anywhere
- **Automated Test Suite** ([server/src/__tests__/](server/src/__tests__/)) ✅
  - Jest + ts-jest testing framework configured
  - 11 automated tests covering:
    - Sector navigation (movement between sectors)
    - Turn consumption (exactly 1 turn per move)
    - Validation errors (unauthorized, invalid sector, no warp)
    - Player creation sector assignment
  - Run tests with: `cd server && npm test`
- **SectorView Component** ([client/src/components/SectorView.tsx](client/src/components/SectorView.tsx)) ✅
  - ASCII art sector visualization with cyberpunk styling
  - Real-time sector scanning and display
  - Port detection with ASCII art indicators ([$], [¥], [€], etc.)
  - Planet detection with visual markers
  - Warp connection display in grid layout
  - Other players in sector with ship details
  - Interactive movement buttons for each warp
  - Turn consumption feedback
  - Loading states and error handling
- **GameDashboard Integration** ([client/src/components/GameDashboard.tsx](client/src/components/GameDashboard.tsx)) ✅
  - SectorView integrated into main game screen
  - Real-time player stats update on movement
  - State management for current sector

### 13. Bug Fixes Applied
- ✅ **Fixed: Player sector assignment bug** - Players were being assigned `sectors.id` (database primary key) instead of `sector_number`. This caused players to appear in "sector 1151" when they should be in sector 1.
- ✅ **Fixed: Universe minimum ports** - Enforced minimum 5% ports and at least 1 port for small universes. Sol (sector 1) excluded from ports for safe starting zone.
- ✅ **Fixed: Warp count bug** - Warps were being doubled (A→B and B→A). Now stored once with bidirectional lookup.
- ✅ **Fixed: Earth planet display** - Added automatic Earth planet creation in Sector 1 during universe generation.
- ✅ **Fixed: Terra Corp ownership** - Earth displays "Owner: Terra Corp" as unclaimable NPC planet.
- ✅ **Fixed: Broadcast message spam** - New players no longer see old broadcasts from before they joined the universe.
- ✅ **Fixed: Broadcast deletion from Sent** - Senders can now delete their own broadcasts from Sent panel; properly returns to Sent view after deletion.
- ✅ **Fixed: Broadcast display in Sent** - Broadcasts show message preview instead of "(no subject)" in Sent list and message view.
- ✅ **Fixed: Sender broadcast deletion from Broadcasts tab** - Sender's own deleted broadcasts now hidden from their Broadcasts view (not just Sent).
- ✅ **Fixed: Corporate messages in Sent** - Corporate messages now show actual corp name instead of "[Corporate]" or "Deleted User".
- ✅ **Fixed: Unread badges persistence** - Broadcasts/corporate read status now tracked per-user in database, badges don't reappear on COMMS reopen.
- ✅ **Fixed: StarDock duplicate ship** - Removed duplicate lowercase "scout" (₡0) from ship_types table, only proper "Scout" (₡10,000) remains.
- ✅ **Fixed: StarDock owned ship display** - Current ship now shows "YOUR SHIP" with value instead of confusing net cost calculation.
- ✅ **Fixed: StarDock fighter/shield max** - Max values now fetched from ship_types table via JOIN (not stored in players table).
- ✅ **Fixed: StarDock FOR UPDATE error** - Split queries to avoid "FOR UPDATE cannot be applied to nullable side of outer join" PostgreSQL error.
- ✅ **Fixed: Banking authentication error** - Banking routes were missing auth middleware and controller was using wrong request property (`req.player` vs `req.user`). All banking operations now work correctly.
- ✅ **Fixed: Banking arithmetic bug** - PostgreSQL returns NUMERIC as strings, causing string concatenation instead of addition. Added parseInt() parsing for all balance operations.
- ✅ **Fixed: Known Traders not showing all players** - Encounters weren't recorded when players were created in same starting sector. Added encounter recording on player creation and when viewing current sector.
- ✅ **Fixed: Messaging display format** - Inbox, Sent, and Known Traders now show "Username (CorporationName)" format instead of just corp_name.

### 14. Port Trading System (FULLY WORKING - TW2002 FAITHFUL!)
- **Port Service** ([server/src/services/portService.ts](server/src/services/portService.ts)) ✅
  - `getPortInfo()` - Retrieves port commodities, prices, and available actions
  - `executeTrade()` - Handles buy/sell transactions with validation
  - **TW2002-faithful pricing:** Buy LOW from ports that SELL, Sell HIGH to ports that BUY
  - ~3x profit margin on good port pairs (port pair trading is now profitable!)
  - Turn consumption per trade
  - Transaction logging to game_events table
  - `regeneratePorts()` - Regenerates port stock over time
  - `startPortRegeneration()` - Auto-regen every 30 minutes (500 units, max 15000)
- **Port Controller** ([server/src/controllers/portController.ts](server/src/controllers/portController.ts)) ✅
  - GET /api/ports/:sectorNumber - Get port details
  - POST /api/ports/trade - Execute commodity trade
- **Rare Port Bonuses** ✅
  - SSS ports sell 30% cheaper (great for buying)
  - BBB ports buy 30% higher (great for selling)
- **PortTradingPanel Component** ([client/src/components/PortTradingPanel.tsx](client/src/components/PortTradingPanel.tsx)) ✅
  - ASCII art port interface with cyberpunk styling
  - Commodity display with color-coded icons (fuel=orange, organics=green, equipment=blue)
  - Quantity input with MAX button for optimal trading
  - Cost preview before trade execution
  - Real-time player stats update (credits, cargo, turns)
- **Cargo Management** ✅
  - GameDashboard displays cargo manifest (fuel, organics, equipment, total)
  - SectorView passes player cargo data to trading panel
  - Cargo limits enforced by ship_holds_max

### 15. StarDock System (FULLY WORKING!)
- **StarDock Service** ([server/src/services/stardockService.ts](server/src/services/stardockService.ts)) ✅
  - `getStardockInfo()` - Get ships for sale, fighter/shield prices, trade-in value
  - `purchaseShip()` - Buy new ships with trade-in (70% of current ship value)
  - `purchaseFighters()` - Buy fighters (100 credits each)
  - `purchaseShields()` - Buy shields (50 credits each)
- **StarDock Generation** ✅
  - 1 StarDock per 500 sectors (minimum 1 for 1000+ sector universes)
  - Special port type 'STARDOCK' with Class 9
  - Unlimited commodity supply (50,000 each)
  - Named "StarDock Alpha-1", "StarDock Alpha-2", etc.
- **StarDock Routes** ([server/src/routes/stardock.ts](server/src/routes/stardock.ts)) ✅
  - GET /api/stardock - Get StarDock info (if at one)
  - POST /api/stardock/ship - Purchase a ship (with trade-in)
  - POST /api/stardock/fighters - Purchase fighters
  - POST /api/stardock/shields - Purchase shields
- **StarDockPanel Component** ([client/src/components/StarDockPanel.tsx](client/src/components/StarDockPanel.tsx)) ✅
  - Full-screen modal interface matching cyberpunk theme
  - Ships tab: All ships with specs, pricing, trade-in savings
  - Equipment tab: Buy fighters (₡100/ea) and shields (₡50/ea)
  - Shows current ship as "YOUR SHIP" with value
  - Net cost calculation (ship price minus trade-in value)
  - MAX button for fighter/shield quantity
  - Real-time player stats update
- **Ship Trade-In System** ✅
  - Trade-in value = 70% of current ship cost
  - Net cost displayed for all ships
  - Cargo/fighters/shields transfer to new ship (limited by capacity)
  - Lost cargo/equipment warning message
- **Ship Types Available** (10 ships from Escape Pod to Dreadnought):
  - **Escape Pod** (5 holds, 0 fighters, 0 shields, ₡0) - Emergency vessel
  - **Scout** (20 holds, 10 fighters, 10 shields, ₡10,000) - Starting exploration ship
  - **Trader** (60 holds, 20 fighters, 20 shields, ₡50,000) - Basic trading vessel
  - **Interceptor** (30 holds, 40 fighters, 30 shields, ₡75,000) - Fast combat vessel with enhanced fighter capacity
  - **Freighter** (125 holds, 40 fighters, 40 shields, ₡125,000) - Mid-tier cargo ship
  - **Transport** (400 holds, 50 fighters, 80 shields, ₡200,000) - Specialized cargo vessel with massive hold capacity
  - **Merchant Cruiser** (250 holds, 80 fighters, 80 shields, ₡250,000) - Advanced trading ship
  - **Battlecruiser** (100 holds, 200 fighters, 200 shields, ₡350,000) - Heavy combat ship with superior firepower
  - **Corporate Flagship** (500 holds, 150 fighters, 150 shields, ₡500,000) - Elite trading vessel
  - **Dreadnought** (200 holds, 400 fighters, 500 shields, ₡750,000) - Massive warship with overwhelming combat capabilities

### 16. Planet Management System (NEW!)
- **Planet Service** ([server/src/services/planetService.ts](server/src/services/planetService.ts)) ✅
  - `getPlanetById()` - Get planet details with production calculation
  - `getPlayerPlanets()` - Get all planets owned by player
  - `claimPlanet()` - Claim unclaimed planets
  - `setProductionType()` - Set fuel, organics, equipment, or balanced
  - `depositColonists()` / `depositResources()` / `depositFighters()` / `depositCredits()`
  - `withdrawResources()` / `withdrawFighters()` / `withdrawCredits()`
  - `upgradeCitadel()` - Upgrade planetary defenses (6 levels)
  - `calculateAndApplyProduction()` - Auto-calculate resource production
- **Planet Controller** ([server/src/controllers/planetController.ts](server/src/controllers/planetController.ts)) ✅
  - GET /api/planets - Get all owned planets
  - GET /api/planets/:id - Get specific planet info
  - POST /api/planets/:id/claim - Claim unclaimed planet
  - PUT /api/planets/:id/production - Set production type
  - POST /api/planets/:id/citadel/upgrade - Upgrade citadel
  - POST /api/planets/:id/colonists/deposit - Deposit colonists
  - POST /api/planets/:id/resources/withdraw - Withdraw resources
  - POST /api/planets/:id/resources/deposit - Deposit resources
  - POST /api/planets/:id/fighters/withdraw - Retrieve fighters
  - POST /api/planets/:id/fighters/deposit - Deploy fighters
  - POST /api/planets/:id/credits/withdraw - Withdraw credits
  - POST /api/planets/:id/credits/deposit - Deposit credits
- **PlanetManagementPanel Component** ([client/src/components/PlanetManagementPanel.tsx](client/src/components/PlanetManagementPanel.tsx)) ✅
  - Modal interface with tabbed navigation
  - Overview tab: Statistics, resources, citadel info, production type selector
  - Resources tab: Deposit/withdraw fuel, organics, equipment
  - Colonists tab: Deposit colonists from ship to planet
  - Fighters tab: Deploy/retrieve fighters
  - Citadel tab: Upgrade citadel with cost display and feature list
- **Colonist Trading at Ports** ✅
  - Buy colonists at trading ports (₡100 each, max 1000 per transaction)
  - GET /api/ports/colonists - Get colonist purchase info
  - POST /api/ports/colonists/buy - Purchase colonists
  - Colonists transported in cargo holds
- **Production Mechanics** ✅
  - Production rates per 1000 colonists per hour:
    - Fuel production: 10 fuel, 2 organics, 2 equipment
    - Organics production: 2 fuel, 10 organics, 2 equipment
    - Equipment production: 2 fuel, 2 organics, 10 equipment
    - Balanced: 5 of each
  - Auto-calculates when planet is visited
  - Stored resources capped at 1,000,000
- **Database Migration 009** ✅
  - Added `colonists` column to players table
  - Added `owner_name` column to planets table

### 17. Ship Log System
- **Ship Log Service** ([server/src/services/shipLogService.ts](server/src/services/shipLogService.ts)) ✅
  - `autoLogSector()` - Auto-logs discoveries when entering sectors
  - `addManualNote()` - Add custom notes to any sector
  - `deleteManualNote()` - Delete manual notes (auto entries cannot be deleted)
  - `getShipLogs()` - Retrieve all logs with stats
  - `getLogStats()` - Get counts by category
- **Auto-Logged Discoveries** ✅
  - SOL: Home sector (sector 1)
  - PORT: Trading ports (with port type)
  - STARDOCK: Ship dealers
  - PLANET: Planets (with name)
  - DEAD_END: Sectors with 0-1 exits
- **ShipLogPanel Component** ([client/src/components/ShipLogPanel.tsx](client/src/components/ShipLogPanel.tsx)) ✅
  - LOG button in header (green, beside COMMS)
  - Color-coded entries by type with icons
  - Filter tabs: All, Ports, Planets, StarDocks, Dead Ends, Notes
  - Stats bar showing discovery counts
  - Add Note form with sector input
  - Delete button for manual notes only
- **Persistence** ✅
  - Logs tied to player (not ship) - survive ship loss/upgrade
  - Unique constraint prevents duplicate auto-entries
  - Migration 007: ship_logs table
- **Reserved Names** ✅
  - Terra Corp is a reserved corporation name (players cannot choose it)
- **Planet Generation** ✅
  - ~3% of sectors receive claimable planets during universe generation
  - Random planet names (e.g., "Alpha Prime", "Nexus Outpost", "Vega Colony")
  - Planets exclude Sector 1 (Earth) and port sectors
  - All generated planets are claimable by players
- **Turn Regeneration System** ✅
  - Turns regenerate gradually based on time elapsed since last update
  - Formula: `turns_per_hour = turns_per_day / 24`
  - Regeneration happens automatically when player data is fetched
  - Capped at universe's `turns_per_day` setting (default 1000)
  - `last_turn_update` timestamp tracks regeneration

## Current Session Context 🎯

**What We Just Did:**
- ✅ **Combat System (FULLY WORKING!):**
  - **Database Migration 011:**
    - Added `kills`, `deaths`, `in_escape_pod`, `last_combat_at` to players table
    - Enhanced `combat_log` with rounds, fighter/shield losses, destruction tracking
    - New indexes for combat history queries
  - **Combat Service** ([server/src/services/combatService.ts](server/src/services/combatService.ts)):
    - `canAttack()` - Validates attack (same sector, has fighters, not in TerraSpace)
    - `executeAttack()` - Full combat simulation with loot calculation
    - `simulateCombat()` - Round-by-round combat with damage/shield mechanics
    - `getCombatHistory()` - Player combat history
    - `getAttackableTargets()` - List attackable players in sector
    - `clearEscapePodStatus()` - Reset after ship upgrade
  - **Combat Controller & Routes** ([server/src/routes/combat.ts](server/src/routes/combat.ts)):
    - POST `/api/combat/attack` - Attack another player
    - GET `/api/combat/targets` - Get attackable targets in sector
    - GET `/api/combat/history` - Get combat history
    - GET `/api/combat/can-attack/:targetId` - Check if can attack
  - **Combat Panel UI** ([client/src/components/CombatPanel.tsx](client/src/components/CombatPanel.tsx)):
    - Full-screen modal with cyberpunk pink theme
    - ASCII art ship battle visualization
    - Animated combat rounds with damage display
    - Victory/Defeat banners with loot summary
    - Pre-combat target stats and warning
  - **SectorView Integration:**
    - Attack buttons on all non-self players in sector
    - Grayed out with tooltip in TerraSpace (safe zone)
    - Shows fighter/shield count for targets
    - Post-combat sector refresh
  - **Combat Mechanics:**
    - 3 turns per attack
    - Round-based combat (max 10 rounds)
    - Fighters deal damage (80-120% of count)
    - Shields absorb damage before fighters
    - Winner = side with remaining fighters
    - Loser destruction = respawn in Escape Pod at Sol
    - 50% loot (credits + cargo) on kill
    - Alignment -100 for killing
    - TerraSpace (sectors 1-10) = combat disabled

**Previous Session:**
- ✅ **TerraSpace Safe Zone (COMPLETE!):**
  - Sectors 1-10 labeled as "TerraSpace" region
  - StarDock in sector 5, no ports/planets except Earth
  - Combat disabled in TerraSpace (enforced by backend)
  - Green safe zone banner in UI
- ✅ **StarDock Banking System (FULLY WORKING!):**
  - **Database Schema (Migration 010):**
    - `bank_accounts` table - Personal and corporate accounts
    - `bank_transactions` table - Full transaction history
    - Constraints ensure data integrity (non-negative balance, valid account ownership)
  - **Banking Service** (`server/src/services/bankingService.ts`):
    - `getOrCreatePersonalAccount()` - Auto-create personal bank accounts
    - `getOrCreateCorporateAccount()` - Auto-create corporate accounts
    - `getPlayerBankAccounts()` - Get all accounts (personal + corp)
    - `depositCredits()` - Deposit from on-hand to bank (free)
    - `withdrawCredits()` - Withdraw from bank to on-hand (free)
    - `transferCredits()` - Send credits to other players (free)
    - `getTransactionHistory()` - Full audit log with pagination
    - `searchPlayers()` - Find players to transfer to
  - **Banking Controller & Routes:**
    - GET `/api/banking` - Get player's bank accounts
    - POST `/api/banking/deposit` - Deposit credits
    - POST `/api/banking/withdraw` - Withdraw credits
    - POST `/api/banking/transfer` - Transfer to another player
    - GET `/api/banking/transactions/:accountId` - Transaction history
    - GET `/api/banking/players/search` - Search for players
  - **Shared Types Updated:**
    - `BankAccount`, `BankTransaction` interfaces
    - `BankingDepositRequest`, `BankingWithdrawRequest`, `BankingTransferRequest`
  - **Features:**
    - Personal account: Each player gets one automatically
    - Corporate account: Each corporation gets one automatically
    - Any corp member can deposit, withdraw from corp account
    - Free banking (no transaction fees)
    - Full transaction log with memo support
    - All players start with credits on-hand (not in bank)
  - **Banking UI** (`client/src/components/StarDockPanel.tsx`):
    - 💰 Banking tab added to StarDock panel
    - Account selection (Personal/Corporate) with live balances
    - Deposit form (On-Hand → Bank) with MAX button
    - Withdraw form (Bank → On-Hand) with MAX button
    - Transfer form with player search and autocomplete
    - Recent transactions display (last 10)
    - Color-coded transactions (green=in, pink=out)
    - Shows memos, related players, timestamps
  - **TerraSpace Visual Indicator** (`client/src/components/SectorView.tsx`):
    - 🛡️ Green safe zone banner displayed in sectors 1-10
    - Shows "TERRASPACE - SAFE ZONE" with shield icons
    - Indicates combat disabled status
    - Styled with green neon border and glow effect
    - Appears at top of sector view when sector.region === 'TerraSpace'

**Previous Session:**
  - ✅ Planet Management System (FULLY WORKING!)
  - ✅ Plot Course Auto-Navigation System with smart pause
  - ✅ Universe Generation Connectivity Fix (BFS verification)
  - ✅ Ship Log unread alerts and sorting

**Servers Currently Running (Network Accessible):**
- Backend: http://localhost:3000 (or http://37.27.80.77:3000)
- Client: http://localhost:5173 (or http://37.27.80.77:5173)
- Admin: http://localhost:5174 (or http://37.27.80.77:5174)

**Ready For:**
- **TESTING COMPLETE:** Economy & combat rebalancing fully tested and verified! ✅
- **Alien System:** Fully implemented, ready for testing (see section 22 below)
- Port creation system
- Fighter/mine deployment in sectors (maintenance system implemented)

**Corporation Chat Channel (Read/Write):** ✅ IMPLEMENTED
- Available to all members of the same corporation
- Real-time communication between alliance members
- Each player starts with their own corporation

**Corporation System (FULLY WORKING!):**
- ✅ **Leave Corporation** - Players can leave their corp (founders must transfer ownership first)
- ✅ **Invite System** - Founder/officers can invite players by username to join
- ✅ **Accept Invites** - Players accept invitations through inbox messages
- ✅ **Kick Members** - Founder/officers can remove members (officers can't kick other officers)
- ✅ **Corporation Ranks** - Founder, Officer, Member with different permissions
- ✅ **Promote/Demote** - Founder can promote members to officer or demote officers
- ✅ **Transfer Ownership** - Founder can transfer ownership to another member
- ✅ **Corporation Panel UI** - Full management interface with member list, invite system, rank management
- ✅ **Automated Tests** - 22 comprehensive tests covering all corporation operations

## In Progress 🚧

### Completed: Combat System ✅
**All tasks completed:**
1. ✅ **Combat Backend** - Attack/defend mechanics, damage calculation
2. ✅ **Combat UI** - ASCII art battle animations with round-by-round display
3. ✅ **Loot System** - 50% credits and cargo looting on kills
4. ✅ **TerraSpace Integration** - Combat disabled in safe zone (sectors 1-10)
5. ✅ **Death/Respawn System** - Escape pod respawn at Sol

### 22. Alien System (FULLY IMPLEMENTED - READY FOR TESTING!) 🛸
**Status:** ✅ All code complete, needs verification testing

**Database Schema** ([server/src/db/migrations/016_alien_system.sql](server/src/db/migrations/016_alien_system.sql)):
- `alien_planets` - NPC planets with citadel levels (3-4), fighters (1K-2K), colonists (50K-100K)
- `alien_ships` - AI-controlled ships with patrol/trade/aggressive/defensive behaviors
- `alien_communications` - Broadcast messages from alien network
- `player_alien_unlocks` - Tracks which players have unlocked alien comms channel

**Backend Services** ([server/src/services/alienService.ts](server/src/services/alienService.ts)):
- `generateAliensForUniverse()` - Auto-generates aliens based on universe size:
  - 0-49 sectors: 0 planets, 1 ship
  - 50-99 sectors: 1 planet, 1-2 ships
  - 100-499 sectors: 1-2 planets, 3-4 ships
  - 500-999 sectors: 2-4 planets, 3-5 ships
  - 1000+ sectors: 0.3% alien planets (~3 per 1000), 2-5 ships per planet
- `getAlienShipsInSector()` / `getAlienPlanetInSector()` - Retrieve alien entities
- `unlockAlienComms()` / `hasAlienComms()` / `getAlienCommunications()` - Comms channel system
- `broadcastAlienComm()` - Broadcasts alien network events
- `attackAlienShip()` - Full combat simulation vs alien ship
- `attackAlienPlanet()` - Full combat simulation vs alien planet (with citadel bonuses)
- `startAlienShipMovement()` - AI patrol system (moves ships every 5 min)
- `startAlienAggression()` - AI combat system (attacks players every 10 min)

**Alien Behaviors:**
- **patrol**: Move randomly near home sector
- **trade**: Move between ports (neutral/friendly)
- **aggressive**: Attack players on sight
- **defensive**: Guard alien planets

**Alien Races:**
Xenthi, Vorlak, Krynn, Sslith, Zendarr, Thorax, Quell, Nebari, Vedran, Pyrians

**API Routes** ([server/src/routes/alien.ts](server/src/routes/alien.ts)):
- GET /api/aliens/comms - Get alien communications (if unlocked)
- GET /api/aliens/sector/:sectorNumber - Get alien ships and planet in sector
- POST /api/aliens/unlock - Unlock alien comms channel
- POST /api/aliens/attack - Attack alien ship
- POST /api/aliens/attack-planet - Attack alien planet

**Frontend Components:**
- **SectorView** ([client/src/components/SectorView.tsx](client/src/components/SectorView.tsx)):
  - Displays alien ships with race, ship type, behavior, fighters/shields
  - Attack buttons for alien ships/planets (disabled in TerraSpace and with 0 turns)
  - Alien combat UI with rounds, damage, loot
  - Escape pod system on player death
  - Auto-unlocks alien comms when entering alien planet sector
- **AlienCommsPanel** ([client/src/components/AlienCommsPanel.tsx](client/src/components/AlienCommsPanel.tsx)):
  - Read-only message feed showing alien network traffic
  - Messages about player encounters, combat, deaths, sector entries
  - Color-coded by alien race

**AI Systems** (Active in [server/src/index.ts](server/src/index.ts)):
- Alien Ship Movement - Every 5 minutes, patrol/trade ships move
- Alien Aggression - Every 10 minutes, aggressive aliens attack players

**Testing Needed:**
1. Create new 1000-sector universe, verify aliens generate
2. Test alien ship combat mechanics
3. Test alien planet combat with citadel defenses
4. Verify alien comms auto-unlock and broadcasts
5. Monitor AI patrol and aggression systems

### Upcoming: Planet Colonization System
**Based on TradeWars 2002 mechanics:**

**Phase 1: Basic Claiming**
1. ✅ **Planet Generation** - ~3% of sectors have claimable planets
2. **Claim Planet API** - POST /api/planets/:id/claim - First player to land claims it
3. **Set Production Type** - Choose: Fuel, Organics, Equipment, or Balanced
4. **Planet View UI** - See owned planets, their stats, production type

**Phase 2: Colonist Economy**
5. **Buy Colonists at Ports** - Special commodity, transported like cargo
6. **Transport to Planet** - Land on planet, deposit colonists
7. **Population Growth** - Colonists reproduce over time (birth rate)
8. **Production Formula** - More colonists = more resources produced

**Phase 3: Resource Collection**
9. **Planet Inventory** - Planets store produced fuel/org/equip
10. **Collect Resources** - Land on planet, load cargo into ship
11. **Sell at Ports** - Complete the profit loop

**Phase 4: Citadel Defense System**
| Level | Cost | Defense Features |
|-------|------|------------------|
| 0 | Free | Colonists only (weak) |
| 1 | 50K | Basic Quasar Cannon |
| 2 | 100K | Improved Weapons |
| 3 | 250K | Atmospheric Defense |
| 4 | 500K | Transporter Beam |
| 5 | 1M | Interdictor (blocks warping) |

**Phase 5: Planet Combat**
12. **Attack Planet** - Fight through sector fighters → bombard planet
13. **Citadel Combat** - Damage citadel, fight colonist militia
14. **Capture vs Destroy** - Take ownership or destroy enemy planet
15. **Deploy Fighters** - Station fighters in sector to protect planet

## Next Steps 📋

### Phase 1: Core Infrastructure
- [x] PostgreSQL migration scripts
- [x] Authentication system (JWT + bcrypt)
- [x] User registration/login API endpoints
- [x] Admin authorization middleware
- [x] Universe generation service
- [x] Ship types seeding
- [x] Player initialization API (backend complete)
- [ ] Player initialization UI (client)

### Phase 2: Admin Panel (Port 5174)
- [x] Admin panel setup with cyberpunk purple theme
- [x] Universe creation UI with suggested defaults
  - Default: 1000 sectors, 12% port distribution
  - Manual override options for all parameters
- [x] Visual universe management dashboard
  - View/delete existing universes
  - Real-time sector/port/player statistics
- [ ] Ship type management interface
- [ ] Player management dashboard
- [ ] Advanced universe editing capabilities

### Phase 3: ASCII Art Graphics System
**Vision**: Use ASCII art as visual graphics (not just text like original TW2002)
- [ ] Research and extract ASCII art from TradeWars 2002
  - Ship designs (Scout, Trader, Freighter, etc.)
  - Port representations (different types)
  - Planet visuals
  - Sector map elements
- [ ] Create ASCII art component library
  - Ship sprites with animations
  - Port visual indicators
  - Planet colony graphics
  - Combat visualizations
- [ ] Cyberpunk color scheme integration
  - Neon green (friendly/systems)
  - Neon cyan (navigation/info)
  - Neon magenta/pink (alerts/danger)
  - Neon purple (special/rare)
- [ ] Terminal-style UI components with ASCII borders
- [ ] Optional: Scanline/CRT screen effects for retro feel

### Phase 4: Game Client
- [x] Login/Registration screens
- [x] Main game dashboard
- [x] Sector navigation interface (complete with ASCII art UI)
- [x] Trading system (port interactions)
- [x] Ship status display (in GameDashboard)
- [x] Cargo management display
- [ ] Turn management
- [ ] Real-time player notifications

### Phase 5: Core Gameplay
- [x] Universe generation service ✅
- [x] Sector navigation logic ✅ (movement + turn consumption)
- [x] Port trading system ✅ (buy/sell commodities with dynamic pricing)
- [x] Turn regeneration system ✅ (gradual regeneration based on time elapsed)
- [ ] Ship upgrade system

### Phase 6: Advanced Features
- [x] Combat system ✅ (rebalanced: 1 turn cost, 75% loot, 25% death penalty)
- [x] Planet generation (~3% of sectors get claimable planets)
- [x] Planet colonization (claim, manage, produce) ✅ (production buffed 5x + citadel bonuses)
- [x] Corporation/alliance system (basic - personal corps, corporate chat)
- [x] Corporation features: invites, leave corp, join another corp ✅ (full management system)
- [x] Fighter/mine deployment ✅ (with maintenance system: ₡5/fighter/day)
- [x] Genesis torpedoes ✅ (₡50K, create planets anywhere, TNN broadcasts)

### Phase 7: Multiplayer & Polish
- [ ] Real-time WebSocket events
- [ ] Combat notifications
- [ ] Player rankings
- [ ] Event log/history
- [ ] Mobile responsive design

## Technical Decisions

### Why PostgreSQL?
- Robust ACID compliance for critical game state
- Excellent performance with proper indexing
- JSON support for flexible event data
- Strong TypeScript ecosystem

### Why Node.js + Express?
- Shared language with frontend (TypeScript)
- Fast, efficient for I/O-heavy multiplayer games
- Excellent WebSocket support (Socket.io)
- Large ecosystem

### Why Socket.io?
- Real-time bidirectional communication
- Automatic reconnection
- Room/namespace support for multiple universes
- Fallback support for older browsers

### Why Vite?
- Lightning-fast development server
- Optimal production builds
- Native TypeScript support
- Modern ESM-based architecture

## Game Mechanics Reference

### Port Types
- **BBS** (Fuel=Buy, Org=Buy, Equip=Sell) - Equipment production
- **BSB** (Fuel=Buy, Org=Sell, Equip=Buy) - Organics production
- **SBB** (Fuel=Sell, Org=Buy, Equip=Buy) - Fuel production
- **SSB, SBS, BSS** - Various configurations
- **SSS** - Sells all (rare, lucrative for traders)
- **BBB** - Buys all (rare, good for dumping cargo)

### Ship Progression (All ships include Torpedoes and Genesis Torpedoes)
| Ship | Holds | Fighters | Shields | Torps | Mines | Beacons | Genesis | Cost | Trade-in (70%) |
|------|-------|----------|---------|-------|-------|---------|---------|------|----------------|
| Escape Pod | 5 | 0 | 0 | 0 | 0 | 0 | 0 | ₡0 | ₡0 |
| Scout | 20 | 10 | 10 | 5 | 5 | 10 | 5 | ₡10,000 | ₡7,000 |
| Trader | 60 | 20 | 20 | 10 | 10 | 15 | 10 | ₡50,000 | ₡35,000 |
| Freighter | 125 | 75 | 75 | 20 | 35 | 25 | 15 | ₡125,000 | ₡87,500 |
| Merchant Cruiser | 250 | 150 | 150 | 40 | 75 | 35 | 20 | ₡250,000 | ₡175,000 |
| Corporate Flagship | 500 | 300 | 1000 | 80 | 150 | 50 | 25 | ₡500,000 | ₡350,000 |

**Notes:**
- All ships carry torpedoes for offensive capabilities (not yet implemented)
- Genesis torpedoes create new planets (not yet implemented)
- Mine capacity increased for better sector defense
- Corporate Flagship has extreme shields (1000) for endgame survivability

### Economy Balance (Tuned 2025-12-02)

**Trading Prices:**
| Commodity | Buy From Port | Sell To Port | Profit/Unit |
|-----------|---------------|--------------|-------------|
| Fuel | ₡10 | ₡34 | ₡24 (3.4x) |
| Organics | ₡17 | ₡60 | ₡43 (3.5x) |
| Equipment | ₡28 | ₡94 | ₡66 (3.4x) |

**StarDock Prices:**
- Fighters: ₡200 each
- Shields: ₡100 each
- Colonists: ₡100 each (at ports)
- Banking: 5% withdrawal fee

**Planet Production (per 1000 colonists per hour) - BUFFED 5x:**
| Type | Base Fuel | Base Organics | Base Equipment | With Citadel Level 5 (+50%) |
|------|-----------|---------------|----------------|----------------------------|
| Fuel Focus | 50 | 10 | 10 | 75 | 15 | 15 |
| Organics Focus | 10 | 50 | 10 | 15 | 75 | 15 |
| Equipment Focus | 10 | 10 | 50 | 15 | 15 | 75 |
| Balanced | 25 | 25 | 25 | 37.5 | 37.5 | 37.5 |

**Citadel Costs (cumulative) - Now Provides Production Bonuses:**
- Level 1: ₡50,000 (Basic Quasar Cannon) - +10% production
- Level 2: ₡150,000 (Enhanced Shields) - +20% production
- Level 3: ₡400,000 (Atmospheric Defense) - +30% production
- Level 4: ₡900,000 (Transporter Beam) - +40% production
- Level 5: ₡1,900,000 (Interdictor Generator) - +50% production

**Combat Economy:**
- **Turn Cost:** 1 turn per attack (reduced from 3)
- **Loot:** 75% of victim's credits/cargo (increased from 50%)
- **Death Penalty:** 25% of credits (on-hand + bank balance) - reduced from 50%
- **Banking:** Requires StarDock, 5% withdrawal fee, 25% bank balance lost on death

**Sector Fighter Maintenance:**
- **Cost:** ₡5 per fighter per day
- **Auto-Destruction:** Fighters destroyed if player can't afford maintenance

**Economy Design Goals:**
- Trading is primary income (~₡1.3K-₡33K per trip)
- Ship upgrades every ~30-70 turns of active play
- Planets are profitable investments (~1 day ROI with buffed production)
- Combat is profitable (75% loot, 1 turn cost makes PvP viable)
- Combat gear costs ~2-3 trade runs for full loadout
- Citadels provide economic benefit (+10% production per level)
- Banking has risk (25% bank balance lost on death) and cost (5% withdrawal fee)

### Default Universe Configuration
- 1000 sectors default
- ~10-15% have ports
- ~3% have claimable planets (~30 planets)
- Bidirectional warp connections
- Sol sector (Earth) - starting location, Terra Corp owned
- AI aliens as NPCs

### Planet Mechanics (TW2002-inspired)
**Production Types:**
- **Fuel** - Produces fuel ore (best fuel output)
- **Organics** - Produces organics (best org output)
- **Equipment** - Produces equipment (best equip output)
- **Balanced** - Produces all three (lower efficiency)

**Colonist System:**
- Buy colonists at ports (special commodity)
- Transport in cargo holds to your planet
- More colonists = higher production rate
- Population grows over time (daily tick)
- Colonists also serve as planetary militia (defense)

**Citadel Levels:**
- Level 0: No citadel (colonists only defense)
- Level 1-2: Basic defenses
- Level 3: Atmospheric defense (harder to bombard)
- Level 4: Transporter (beam cargo without landing)
- Level 5: Interdictor generator (enemies can't warp out)

**Planet Strategy:**
1. Find remote sector (fewer visitors = safer)
2. Claim planet, set production type
3. Transport colonists (thousands for good production)
4. Build citadel for defense
5. Regularly collect produced resources
6. Sell at ports for profit

## Development Environment

### Ports
- **Client (Game)**: `http://localhost:5173` - Player game interface
- **Admin Panel**: `http://localhost:5174` - Universe/game management (admin only)
- **Backend API**: `http://localhost:3000` - REST API + WebSocket server

### Network/Remote Access
- All servers bind to `0.0.0.0` for network accessibility
- Production IP: `37.27.80.77` (configured in CORS)
- API URL configurable via `VITE_API_URL` environment variable
- Production configs in `.env.production` files

### Database
- PostgreSQL on `localhost:5432`
- Database name: `tradewars`

### Utility Scripts
Located in `server/scripts/`:
- **resetPassword.js** - Reset user password for testing
  ```bash
  cd server && node scripts/resetPassword.js
  ```
  Resets `testplayer` password to `password123`

## Design Philosophy

### ASCII Art as Graphics
Unlike the original text-only TradeWars 2002, this modern version uses ASCII art as **visual graphics elements**:
- Ships rendered as ASCII sprites (not just names)
- Ports shown with distinctive ASCII art indicators
- Sector views with visual ASCII map representations
- Combat animations using ASCII art
- Planet colonies displayed with ASCII graphics

Source material from original TradeWars 2002 ASCII art will be adapted and enhanced with cyberpunk neon styling.

### Cyberpunk Aesthetic
- **Neon Green**: Friendly systems, go signals, positive status
- **Neon Cyan**: Navigation, information, neutral data
- **Neon Magenta/Pink**: Alerts, danger, warnings, combat
- **Neon Purple**: Special items, rare events, admin functions
- **Black background**: Terminal-style with optional CRT effects

## Contributing

When implementing new features:
1. Update shared types in `shared/types.ts` first
2. Implement backend logic in `server/`
3. Create frontend components in `client/` or `admin/`
4. Update this status document
5. Commit with descriptive messages

## 🔔 AI Assistant Reminder

**IMPORTANT:** This `PROJECT_STATUS.md` file serves as the primary memory and context for AI assistants working on this project.

**⚠️ DO NOT USE IDEAS.md** - That file is for the user's personal brainstorming notes only. AI assistants should NOT read from or write to IDEAS.md. It contains informal ideas and is not part of the project documentation.

**Always keep updated:**
- `PROJECT_STATUS.md` - Current state, completed features, bugs, session context
- `README.md` - User-facing documentation, setup instructions, feature list

**Update this file FREQUENTLY:**
- After ANY bug fix or feature change (no matter how small)
- This file serves as your context log and memory
- Document all changes in "Recent Changes" section with date
- Include technical details: what was broken, why, and how it was fixed
- Link to specific files and line numbers when relevant

**After each significant change:**
1. Update "Current Session Context" or "Recent Changes" section with what was done
2. Move completed items to "Completed ✅" section
3. Update phase checklists in "Next Steps"
4. Log any bug fixes with technical details
5. Commit changes with descriptive messages

**Before starting work:**
1. Read this file to understand current project state
2. Check "Ready For" section for next priorities
3. Review "In Progress" for current focus areas

---

**Last Updated:** 2025-12-02
**Status:** Economy & Combat Rebalancing Complete! Banking Fixes, Combat Improvements, Automated Tests Added
**Current Session:** Economy fixes and automated testing
**Next Priority:** Comprehensive Testing / Alien System
**Recent Changes:**
- ✅ **StarDock / Combat UX Fixes (2025-12-10):**
  - Ship trade-ins now clear escape-pod flag and carry over fighters, shields, mines, beacons, and genesis torpedoes up to the new ship’s capacity; excess is discarded. (`server/src/services/stardockService.ts`)
  - Player death/respawn now zeroes mines, beacons, and genesis in addition to fighters/shields/cargo for PvP and alien combat. (`server/src/services/combatService.ts`, `server/src/services/alienService.ts`)
  - Fixed alien combat death penalty type error (`0.25` now numeric) to prevent attack crashes. (`server/src/services/alienService.ts`)
  - CombatPanel no longer crashes on undefined `setUpdatedPlayer`, preventing double-render of victory/defeat modals. (`client/src/components/CombatPanel.tsx`)
  - Sector scan reflects new ship details immediately after StarDock purchases. (`client/src/components/GameDashboard.tsx`, `client/src/components/SectorView.tsx`)
- ✅ **Combat System (2025-12-01):**
  - Full player-vs-player combat with round-based mechanics
  - Combat Service: canAttack(), executeAttack(), simulateCombat()
  - Combat Routes: POST /api/combat/attack, GET /api/combat/targets, history
  - CombatPanel UI with ASCII art battle animations
  - Attack buttons in SectorView for players in same sector
  - TerraSpace (sectors 1-10) combat protection enforced
  - Death/respawn: Escape Pod at Sol, 50% loot to winner
  - Database migration 011 for combat tracking columns
  - Shared types: CombatResult, CombatRound, AttackableTarget
- ✅ **Banking Arithmetic Fix (2025-12-01):**
  - Fixed string concatenation bug in banking deposits/withdrawals/transfers
  - PostgreSQL returns NUMERIC columns as strings, causing "10" + 1 = "101" instead of 11
  - Added `parseInt()` parsing for all balance values in bankingService.ts
  - Added `parseInt()` validation for amount in bankingController.ts
  - All banking math now works correctly
- ✅ **Messaging Display Format Fix (2025-12-01):**
  - Known Traders dropdown now shows "Username (CorporationName) - ShipType"
  - Inbox messages now show sender as "Username (CorporationName)"
  - Sent messages now show recipient as "Username (CorporationName)"
  - Updated getKnownTraders() to JOIN users and corporations tables
  - Updated getInbox() to fetch username and corporation name
  - Updated getSentMessages() to fetch username and corporation name
- ✅ **Player Encounter Recording Fix (2025-12-01):**
  - Fixed bug where players in same sector weren't showing as Known Traders
  - Added encounter recording when new player is created in starting sector
  - Added encounter recording when player views their current sector
  - Encounters now recorded bidirectionally in playerService.ts and sectorController.ts
- ✅ **Banking Authentication Fix (2025-12-01):**
  - Fixed "Cannot read properties of undefined (reading 'id')" error in banking operations
  - Banking controller was using `req.player.id` but auth middleware only sets `req.user`
  - Updated all banking controller functions to get player ID from `req.user.userId`
  - Added authentication middleware to banking routes
  - All banking operations now work: deposit, withdraw, transfer, transaction history, player search
- ✅ **Economy Balance Pass (COMPLETE!):**
  - Planet production nerfed 10x (was OP - ₡113K/hr → ₡11K/hr with 10K colonists)
  - Fighter price doubled: ₡100 → ₡200 each
  - Shield price doubled: ₡50 → ₡100 each
  - Full economy analysis documented in Game Mechanics Reference
  - ROI for planets now ~5 days instead of ~12 hours
  - Combat gear now costs 2-3 trade runs for full loadout
- ✅ **StarDock System (COMPLETE!):**
  - Full-screen StarDockPanel component with Ships and Equipment tabs
  - Ship trade-in system (70% value of current ship)
  - Net cost display (ship price minus trade-in)
  - Fighter purchase (₡200/ea) with MAX button
  - Shield purchase (₡100/ea) with MAX button
  - Current ship shown as "YOUR SHIP" with equipped status
  - Fixed duplicate "scout" ship in database
  - Fixed FOR UPDATE error on fighter/shield purchase
  - Ship stats (fighter/shield max) fetched from ship_types table
- ✅ **Planet Management System (COMPLETE!):**
  - Claim unclaimed planets
  - Set production type (fuel, organics, equipment, balanced)
  - Auto-production based on colonist population
  - Resource transfer (deposit/withdraw fuel, organics, equipment)
  - Colonist management (buy at ports, transport to planets)
  - Fighter deployment to planets
  - Credits treasury
  - Citadel defense system (6 levels, ₡50K-₡1M)
  - Full management UI with tabbed interface
  - Migration 009: player colonists column
- ✅ **Plot Course Auto-Navigation:**
  - Smart pause at points of interest
  - Path index synchronization fix
  - Universe connectivity verification
- ✅ **Enhanced Combat System (2025-12-01):**
  - **Shield Mechanics:** Each shield point absorbs 2 damage (shields protect fighters)
  - **Combat Randomness:** 50-150% damage variation, 10% critical hit chance (2x damage), 15% dodge chance (50% damage reduction)
  - **Mutual Destruction:** Both attacker and defender can be destroyed in combat
  - **Escape Pod System:** Destroyed players respawn in random adjacent sector (or Sol if none) in escape pod
  - **Colonist Deaths:** All colonists on destroyed ship are lost with notification message
  - **Cargo Looting:** Winner takes all cargo, excess cargo floats in sector if winner's hold is full
  - **WebSocket Events:** `combat_occurred` and `escape_pod_arrived` events broadcast to sector
  - **Database Migration 011:** Added `kills`, `deaths`, `escape_pod_count`, `in_escape_pod` columns
- ✅ **Floating Cargo System (2025-12-01):**
  - **Database Migration 012:** Created `sector_cargo` table for floating cargo
  - **Cargo Service:** Handles pickup, jettison, partial pickup, expiration (24 hours)
  - **Combat Loot:** Excess cargo from combat floats in sector
  - **Priority Pickup:** Equipment > Organics > Fuel (smart cargo prioritization)
  - **Sector Display:** Floating cargo shown in SectorView with pickup button
  - **API Routes:** GET /api/cargo, POST /api/cargo/pickup
- ✅ **Beacon System (2025-12-01):**
  - **Database Migration 013:** Created `beacons` table, added `ship_beacons_max` to ship_types, `ship_beacons` to players
  - **Beacon Service:** Purchase (₡500/ea), launch (255 char message), attack (0-5 fighter loss), retrieve
  - **Capacity by Ship:** Escape Pod (1), Scout/Trader (5), Larger ships (15)
  - **Beacon Display:** Shows in sector with owner name and message
  - **Attack System:** Attack other players' beacons, lose 0-5 fighters, owner gets inbox notification
  - **Inbox Notification:** "From: [Player]'s Beacon", "Attacker: [username] ([corp])" format
  - **TerraSpace Restriction:** Beacons cannot be launched in sectors 1-10 (safe zone)
  - **WebSocket Broadcasting:** Beacon messages broadcast to all players in sector when ship arrives
  - **API Routes:** GET /api/beacons/info, POST /api/beacons/purchase, POST /api/beacons/launch, POST /api/beacons/attack, POST /api/beacons/retrieve
  - **StarDock Integration:** Purchase beacons in Equipment tab
- ✅ **Sector Fighter Deployment System (2025-12-01):**
  - **Database Migration 014:** Created `sector_fighters` table for stationed fighters
  - **Fighter Service:** Deploy, retrieve, attack stationed fighters, retreat with damage
  - **Max Deployment:** 500 fighters per player per sector
  - **Combat:** Attack stationed fighters uses same combat mechanics as player combat
  - **Retreat Option:** When entering sector with hostile fighters, can retreat (0-10% damage) or attack
  - **Hostile Encounter Modal:** Shows on sector entry with retreat/attack options
  - **Owner Notifications:** Fighter owners receive inbox messages when attacked
  - **TerraSpace Restriction:** Cannot deploy fighters in safe zone
  - **API Routes:** GET /api/sector-fighters, POST /api/sector-fighters/deploy, POST /api/sector-fighters/retrieve, POST /api/sector-fighters/attack, POST /api/sector-fighters/retreat
- ✅ **Deep Sector Scan Feature (2025-12-01):**
  - **Scan Adjoining Sector:** Costs 1 turn, shows detailed sector info without moving
  - **Enhanced Scan Results:** Shows ships (names, corps, ship types, fighters, shields), ports (type, buy/sell flags), planets (name, owner), stationed fighters (owner, count), beacons (owner, encrypted message), floating cargo, warps, sector defenses
  - **Scan Modal:** Full detailed display with color-coded sections
  - **API Route:** POST /api/sectors/scan/:sectorNumber
- ✅ **UI Notification System (2025-12-01):**
  - **Removed Browser Alerts:** All `alert()` calls replaced with in-panel UI notifications
  - **Success Messages:** Green panels for successful actions (beacon launch, retreat, etc.)
  - **Attack Results:** Color-coded panels (green=victory, orange=retreat) with detailed combat stats
  - **Beacon Attack Results:** Pink panel showing attack outcome and fighter losses
  - **Auto-Dismiss:** All notifications auto-dismiss after 8-10 seconds with manual dismiss button
  - **Beacon Broadcasting:** Beacon messages appear as WebSocket toast notifications (no alerts)
- ✅ **Ship Log Auto-Logging Fix (2025-12-01):**
  - Ship log now logs sector on initial load (not just when moving)
  - Auto-logs SOL, ports, StarDocks, planets, dead-ends when viewing current sector
  - Fixes issue where starting sector wasn't logged until leaving
- ✅ **Combat System Enhancements (2025-12-01):**
  - **Combat Messages:** Now show "PlayerName (CorpName)" format instead of just "CorpName"
  - **Escape Pod Distance:** Escape pods now warp 1-3 jumps away (not just adjacent sectors)
  - **Escape Pod UI:** Shows prominent escape pod message with destination, auto-closes combat panel after 6 seconds
  - **Combat Notifications:** WebSocket messages show "PlayerName (CorpName)'s ship was DESTROYED!" format
  - **Async Combat:** Combat simulation now uses async escape sector calculation with BFS pathfinding
- ✅ **Beacon System Fixes (2025-12-01):**
  - **Beacon Retrieval:** Fixed beacon count not updating after retrieval - now updates immediately from API response
  - **Beacon Message Sender:** Fixed inbox messages showing "[Deleted Player]" - now shows "{PlayerName}'s Beacon - Sector {Number}"
  - **Beacon Attack:** Fixed PostgreSQL "FOR UPDATE cannot be applied to nullable side of outer join" error
  - **Beacon Attack Error Handling:** Improved error handling to prevent server crashes, returns error objects instead of throwing
  - **Beacon UI:** Removed browser alerts, all beacon actions use in-panel UI notifications
- ✅ **Universe Generation TerraSpace Fixes (2025-12-01):**
  - **TerraSpace Warp Rules:** Only sectors 5-10 can have warps outside TerraSpace (not sectors 1-4)
  - **Sectors 1-4:** Exclusively intra-TerraSpace warps (sectors 1-10 only)
  - **Sectors 5-10:** Mixed warps - 1-3 out of TerraSpace + 2-4 within TerraSpace (total 3-7 warps)
  - **Warp Validation:** Added validation to prevent sectors 1-4 from warping outside TerraSpace
  - **Connectivity Check:** Fixed unreachable sector connection to respect TerraSpace rules
- ✅ **UI/UX Fixes (2025-12-01):**
  - **Deploy Fighters Button:** Removed deploy fighters button from deep scan results modal (should only appear in main sector view)
  - **Retreat Black Screen Fix:** Fixed black screen when fleeing to a sector - now directly fetches new sector details using sector number from response instead of relying on prop updates
  - **Fighter Destruction Messages:** Updated inbox messages when deployed fighters are destroyed to show "Playername (Corpname)" format instead of just "Corpname"
  - **SQL Query Enhancement:** Updated fighter attack query to join with users table to fetch attacker username for proper message formatting
- ✅ **TNN Broadcast Display Fix (2025-12-02):**
  - **Issue:** TerraCorp News Network broadcasts showed "TerraCorp News Network (Unknown)" instead of "TerraCorp News Network (TNN)"
  - **Root Cause:** Client was trying to display `sender_corp` field which doesn't exist for TNN broadcasts
  - **Fix:** Added conditional check in MessagingPanel.tsx:592 - if sender is "TerraCorp News Network", display "(TNN)" instead of attempting to show corporation
  - **Result:** Combat broadcasts now properly show "TerraCorp News Network (TNN)" format
- ✅ **Economy & Combat Rebalancing (2025-12-02):**
  - **Banking System Fixes:**
    - **StarDock Location Requirement:** All banking operations (deposit, withdraw, transfer) now require player to be at a StarDock (prevents banking from anywhere exploit)
    - **Withdrawal Fee:** Added 5% withdrawal fee (₡5 per ₡100 withdrawn) - shown in UI with warning box and transaction memo
    - **Death Penalty:** On death, players lose 25% of bank balance (in addition to 25% of on-hand credits)
    - **UI Updates:** Withdrawal fee preview shown before withdrawal, success message includes fee details
  - **Combat Rebalancing:**
    - **Turn Cost:** Reduced from 3 turns to 1 turn per attack (makes PvP more profitable)
    - **Loot Percentage:** Increased from 50% to 75% of victim's credits/cargo (makes PvP profitable)
    - **Death Penalty:** Reduced from 50% to 25% of credits (both on-hand and bank balance)
    - **Attacker Cargo Loss:** Reduced from 100% to 75% when attacker is destroyed
  - **Ship Cost Database Fix:**
    - Scout: Fixed from ₡1,000 to ₡10,000 (matches documentation)
    - Trader: Fixed from ₡10,000 to ₡50,000 (matches documentation)
    - Corporate Flagship: Fixed from ₡1,000,000 to ₡500,000 (matches documentation)
  - **Sector Fighter Maintenance:**
    - **Maintenance Cost:** ₡5 per fighter per day
    - **Auto-Destruction:** Fighters destroyed if player can't afford maintenance
    - **UI Warnings:** Maintenance cost shown when deploying fighters, daily cost displayed on deployed fighters
    - **Notifications:** Players receive inbox message when fighters destroyed due to non-payment
    - **Database Migration 015:** Added `last_maintenance` timestamp field to `sector_fighters` table
    - **Function:** `chargeFighterMaintenance()` should be called daily (via cron or daily tick)
  - **Planet Production Buff:**
    - **Production Rates:** Increased 5x (e.g., equipment: 10 → 50 per 1000 colonists/hour)
    - **Citadel Bonuses:** +10% production per citadel level (max +50% at level 5)
    - **Example:** 10K colonists on equipment planet with level 5 citadel = ~₡82K/hour (was ~₡11K/hour)
  - **Corporate Account Permissions:**
    - **Founder:** Unlimited withdrawals
    - **Officer:** Max ₡100,000 per transaction
    - **Member:** Max ₡10,000 per transaction
  - **Automated Test Suite:**
    - **Banking Tests (10 tests):** StarDock requirement, withdrawal fee, corporate limits
    - **Combat Tests (7 tests):** Turn cost (1 turn), loot percentage (75%), death penalty (25%)
    - **All 17 tests passing:** Verified all economy fixes working correctly
  - **Manual Testing Guide:**
    - **Created:** `MANUAL_TESTING_GUIDE.md` with comprehensive test cases
    - **Coverage:** Banking, combat, fighter maintenance, planet production, corporate accounts, ship costs
    - **Status:** Ready for next round of testing
    - **Note:** Manual testing to be performed in next testing phase
  - **UI Improvements (2025-12-02):**
    - **No Browser Popups:** Replaced all `prompt()`, `alert()`, and `confirm()` calls with UI modals
    - **Fighter Retrieval:** Modal input instead of browser prompt
    - **Delete Confirmation:** Inline confirmation UI instead of browser confirm
    - **Real-time Updates:** Ship status (fighters) updates immediately on deploy/retrieve
    - **State Management:** Improved parent-child state synchronization for instant UI updates

**Notification & Broadcasting System (NEW!):**
- ✅ **Centralized Broadcast Service** ([server/src/services/broadcastService.ts](server/src/services/broadcastService.ts)):
  - `broadcastTNN()` - TerraCorp News Network broadcasts for public events
  - `broadcastAlienComms()` - Alien Communications for alien-related events
  - Both functions handle database insertion and WebSocket real-time events
  - Replaces old scattered broadcasting code with consistent API
- ✅ **TNN Broadcasts (TerraCorp News Network):**
  - Player ship destruction by mines (with mine owner names)
  - Player ship destruction by alien ships
  - Player ship destruction by alien planets
  - New player welcome messages when joining universe
- ✅ **Alien Communications Broadcasts:**
  - Alien ship combat (destroyed, player destroyed, draw)
  - Alien planet combat (destroyed, player destroyed, draw)
  - Alien ships triggering mines (with damage details)
  - Alien ships destroyed by mines
  - Alien ships retreating from deployed fighters
  - Alien ships attacking deployed fighters
  - Alien ship destroyed by deployed fighters
  - Alien ship movement (30% chance to avoid spam)
  - Player/alien encounter detection

**Current Session (2025-12-09):**
- ✅ **Alien Attack Hang Fix (CRITICAL - FULLY RESOLVED!):**
  - **Root Cause #1:** API_URL in client config had `/api` suffix, causing double `/api/api/...` paths
    - Fixed: [client/src/config/api.ts](client/src/config/api.ts#L11) - Removed `/api` suffix from derived URL
    - Fetch calls already include `/api/...` in their paths
  - **Root Cause #2:** Database row-level locks causing hangs when multiple attacks/views occurred
    - Fixed: Added `SKIP LOCKED` to alien ship/planet queries in [server/src/services/alienService.ts](server/src/services/alienService.ts)
    - Alien ship attack (line 692): `FOR UPDATE OF a SKIP LOCKED`
    - Alien planet attack (line 1153): `FOR UPDATE OF ap SKIP LOCKED`
    - Now fails fast with "currently engaged" error instead of hanging
  - **Root Cause #3 (THE BIG ONE!):** `broadcastAlienMessage()` called INSIDE transactions causing deadlocks
    - **Problem:** `broadcastAlienMessage()` uses `pool.query()` to get NEW connection while transaction holds locks
    - **Deadlock Scenario:** Transaction A locks planet → tries to INSERT alien_comms → waits for connection → Transaction B waits for planet lock → **INFINITE WAIT**
    - **Symptom:** Queries stuck as "idle in transaction" with ungranted ShareLocks
    - **Fixed:** Moved ALL `broadcastAlienMessage()` calls to AFTER `COMMIT` (outside transaction)
    - **Locations Fixed:**
      - `attackAlienShip()` - Planet/ship destruction broadcasts (line 825)
      - `alienAttackPlayer()` - Combat engagement broadcasts (line 1065)
      - `attackAlienPlanet()` - Victory/defeat broadcasts (line 1323)
    - Now broadcasts can't block transaction commits!
  - **Performance Optimization:** Removed alien encounter broadcasting during sector reads
    - [server/src/controllers/sectorController.ts](server/src/controllers/sectorController.ts#L240): Removed write operations from read endpoint
    - Prevents potential deadlocks from concurrent reads/writes
  - **Early Validation:** Added pre-flight checks in alien attack controller
    - [server/src/controllers/alienController.ts](server/src/controllers/alienController.ts): Validates escape pod, fighters, turns, TerraSpace BEFORE database locks
    - Prevents unnecessary transaction starts and lock acquisition
  - **Client Timeout Protection:** Added AbortController with 10-second timeout
    - [client/src/components/SectorView.tsx](client/src/components/SectorView.tsx#L1027): Timeout guard for alien planet attacks
    - Shows clear error message on timeout instead of hanging forever
  - **Auto-Navigation Enhancement:** Plot Course now pauses at alien encounters
    - [server/src/services/pathfindingService.ts](server/src/services/pathfindingService.ts): Added alien planet/ship detection to path sectors
    - [client/src/components/SectorView.tsx](client/src/components/SectorView.tsx#L1092): Auto-pause at alien points of interest
  - **Result:** Alien attacks now work perfectly! No more hangs, no more sector locks, all transactions complete cleanly!
- ✅ **Ship Balance Adjustments:**
  - **Removed duplicate "scout"** - Deleted lowercase scout with no mines/beacons
  - **Corporate Flagship buff** - Now a true endgame ship:
    - Fighters: 150 → 300 (2x increase)
    - Shields: 150 → 300 (2x increase)
    - Mines: 80 → 150 (nearly 2x)
    - Beacons: 30 → 50 (significant increase)
  - **Merchant Cruiser buff** - Better progression:
    - Fighters: 80 → 150 (nearly 2x)
    - Shields: 80 → 150 (nearly 2x)
    - Mines: 40 → 75 (nearly 2x)
    - Beacons: 25 → 35
  - **Freighter buff** - More viable for combat:
    - Fighters: 40 → 75 (nearly 2x)
    - Shields: 40 → 75 (nearly 2x)
    - Mines: 20 → 35 (better zone control)
    - Beacons: 20 → 25
  - **Design Goal:** Corporate Flagship now feels like a powerful warship worth ₡500K
- ✅ **Mine System Bug Fix:**
  - **Issue:** StarDock showing 0/0 mines for Corporate Flagship
  - **Root Cause:** Mine routes using `req.user.id` (user ID) instead of player ID
  - **Fixed:** [server/src/routes/mines.ts](server/src/routes/mines.ts) - All three routes now properly convert userId to playerId
  - Routes fixed: GET /info, POST /purchase, POST /deploy
- ✅ **Corporate Flagship Shield Buff:**
  - Shields: 300 → 1000 (3.3x increase!)
  - Now has extreme survivability matching its ₡500K price tag
- ✅ **Alien Combat Result Flash Fix:**
  - **Issue:** Victory/defeat messages flashing once and immediately disappearing
  - **Root Cause:** `loadSectorDetails()` called immediately after setting combat result, clearing it
  - **Fixed:** Moved sector reload to AFTER user closes combat panel
  - Applied to both alien ship and alien planet attacks
  - Combat results now stay visible until user dismisses them
- ✅ **Comprehensive Notification System (2025-12-09):**
  - **Created [broadcastService.ts](server/src/services/broadcastService.ts)** with centralized helpers:
    - `broadcastTNN()` - Public news broadcasts (ship destructions, new players)
    - `broadcastAlienComms()` - Alien activity monitoring (combat, movement, encounters)
  - **Replaced all legacy broadcasting:**
    - Removed old `broadcastAlienMessage()` function from alienService
    - Updated all 8+ broadcast callsites to use new centralized service
    - Cleaned up unused imports from sectorController
  - **TNN Broadcasts Added:**
    - Player ship destroyed by mines → TNN with mine owner names
    - Player ship destroyed by alien ships → TNN with alien race/name
    - Player ship destroyed by alien planets → TNN with planet location
    - New player joins universe → TNN welcome announcement
  - **Alien Comms Broadcasts Added:**
    - All alien ship combat (destroyed, player destroyed, draw)
    - All alien planet combat (victory, defeat, draw)
    - Alien ship hits mines (with damage report)
    - Alien ship destroyed by mines
    - Alien ship retreats from deployed fighters
    - Alien ship attacks deployed fighters
    - Alien ship destroyed by deployed fighters
    - Alien movement into sectors (30% chance)
    - Player/alien encounters in sectors
  - **Code Quality:**
    - Fixed TypeScript errors in alienService and corporationService
    - Removed code duplication across services
    - Consistent broadcast patterns throughout codebase
  - **Result:** Players are now fully informed of all universe activity through appropriate channels!
- ✅ **Genesis Torpedo System (2025-12-10):**
  - **Database Migration 020:** Added `ship_genesis` column to players table
  - **Backend Services** ([genesisService.ts](server/src/services/genesisService.ts)):
    - `getGenesisInfo()` - Get current/max genesis torpedoes and price
    - `purchaseGenesis()` - Buy torpedoes at StarDock (₡50,000 each)
    - `launchGenesis()` - Deploy torpedo to create new planet (costs 1 turn)
  - **API Routes** ([genesis.ts](server/src/routes/genesis.ts)):
    - GET /api/genesis/info - Get torpedo information
    - POST /api/genesis/purchase - Purchase at StarDock
    - POST /api/genesis/launch - Launch torpedo in current sector
  - **Gameplay Mechanics:**
    - Price: ₡50,000 per torpedo
    - Capacity by ship: Scout (5), Trader/Freighter (10-15), Corporate Flagship (25)
    - Launch costs 1 turn
    - Creates unclaimed planet with random name (e.g., "New Prime", "Genesis Station")
    - Restrictions: Cannot launch in TerraSpace (1-10), port sectors, or sectors with existing planets
    - TNN broadcast announces planet creation to entire universe
  - **UI Integration:**
    - StarDock Equipment tab: Purchase section with purple theme
    - SectorView: "Launch Genesis" button (shows when carrying torpedoes)
    - Only appears in valid sectors (outside TerraSpace, no planet/port)
  - **Result:** Players can now create planets anywhere, expanding colonization opportunities!

**Mine Mechanics (Current Behavior):**
- ✅ **Corp Safety:** Corporation members are SAFE from each other's mines
  - Code: [mineService.ts:232](server/src/services/mineService.ts#L232) - `p.corp_name != $3`
  - Only non-corp members trigger explosions
- ✅ **Player Triggering:** Enemy players WILL trigger mines when entering sector
  - 20-90% chance per mine to explode
  - 150 base damage per mine (50-150% variance = 75-225 damage)
  - Shields absorb damage first, then fighters take damage
  - Mines are destroyed when they explode
- ✅ **Alien Triggering:** Aliens NOW trigger mines when moving!
  - Same mechanics as players (20-90% explosion chance, 75-225 damage)
  - Aliens can be destroyed by mines
  - Mine owner gets notification via alien communications channel

**Game Balance (2025-12-09):**
- ✅ **Turn Economy:**
  - **Turns per day:** 300 (reduced from 1000)
  - **Regeneration:** ~12.5 turns/hour = 1 turn every 4.8 minutes
  - **Daily Usage Estimate:**
    - Exploration (20 sectors): 20 turns
    - Trading (5 routes @ 8 jumps): 40 turns
    - Combat (10 attacks): 10 turns
    - Reserve: 230 turns for repositioning/emergencies
  - **Design Goal:** Players must be strategic about movement, can't explore entire universe in one day
- ✅ **Mine Pricing:**
  - **Cost:** ₡10,000 per mine (reduced from ₡50,000)
  - **10 mines:** ₡100,000 (reasonable sector defense)
  - **50 mines:** ₡500,000 (heavy fortification = 1 Corporate Flagship)
  - **Damage:** 75-225 per explosion (20-90% trigger chance)
  - **Expected damage:** 10 mines = ~825 damage (can destroy Merchant Cruiser alien)
  - **Design Goal:** Mines are viable defense option, not prohibitively expensive
- ✅ **Alien Ship Strength:**
  - **Stats:** 65-90% of ship type max (increased from 50-75%)
  - **Example Merchant Cruiser:** 98-135 fighters, 98-135 shields (total: 196-270)
  - **Player Merchant Cruiser:** 150 fighters, 150 shields (total: 300)
  - **Player Advantage:** ~1.5-2x stronger than aliens in same ship class
  - **Design Goal:** Aliens are threatening but beatable, require actual strategy
- ✅ **Combat Balance:**
  - Simple damage model: fighters deal damage equal to count
  - Shields absorb first, then fighters take damage
  - Deployed fighters provide free sector defense
  - Mines complement fighters for layered defense

**Alien vs Deployed Fighters (NEW!):**
- ✅ **Aliens Encounter Deployed Fighters:**
  - When alien moves into sector with deployed fighters, they evaluate the threat
  - **Flee Decision:** If alien strength < 50% of fighter strength, alien RETREATS
    - Alien returns to previous sector
    - Fighter owner gets notification: "Alien Retreat - Sector X"
  - **Fight Decision:** If alien is strong enough, they ATTACK
    - Simple combat: Each side deals damage equal to their fighter count
    - Fighters destroyed, alien loses shields/fighters
    - Fighter owner gets detailed combat report via inbox
  - **Notifications:** Owner is alerted whether alien retreats OR attacks
  - **Multiple Deployments:** Alien fights each deployment one by one
  - Aliens can be destroyed by deployed fighters
  - **Implementation:** [alienService.ts:454-573](server/src/services/alienService.ts#L454-L573)
    - Mine checking via `checkMinesOnAlienEntry()` in [mineService.ts:393-517](server/src/services/mineService.ts#L393-L517)
    - Fighter checking via `getHostileFightersForAlien()` in [sectorFighterService.ts:733-749](server/src/services/sectorFighterService.ts#L733-L749)
    - Combat via `alienAttackDeployedFighters()` in [sectorFighterService.ts:755-854](server/src/services/sectorFighterService.ts#L755-L854)

**Previous Session (2025-12-04):**
- ✅ **Player Creation Bug Fixes:**
  - **Issue 1:** Players weren't getting `corp_id` set on creation
    - Added UPDATE statement to set player's `corp_id` after creating corporation
    - Updated returned player object to include `corp_id` value
  - **Issue 2:** Foreign key constraint violation on `player_encounters` table
    - `recordEncounter()` was called before transaction committed
    - Moved encounter recording to AFTER COMMIT so new player is visible
    - Error: "Key (player_id)=(X) is not present in table players"
  - **Admin Panel Updates:**
    - Changed "Max Sectors" label to "Sectors" for clarity
    - Removed max limit on starting credits (kept min 1000)
    - Admin has full control over starting credits now
  - All player creation issues resolved and tested

**Previous Session (2025-12-03):**
- ✅ **Corporation Management System (COMPLETE!):**
  - **Database Migrations:**
    - 018_corporation_player_link.sql - Added `corp_id` column to players table
    - 019_corporation_message_types.sql - Added 'corp_invite' and 'inbox' message types
  - **Backend Services** ([server/src/services/corporationService.ts](server/src/services/corporationService.ts)):
    - `getCorporationDetails()` - Get corp info with all members sorted by rank
    - `leaveCorporation()` - Leave corp (founders must transfer ownership first)
    - `invitePlayer()` - Founder/officers invite by username, sends inbox message
    - `acceptInvitation()` - Accept invite and join corporation
    - `kickMember()` - Founder/officers remove members (officers can't kick other officers)
    - `changeRank()` - Founder promotes/demotes between member and officer
    - `transferOwnership()` - Founder transfers founder role to another member
  - **Backend Controllers** ([server/src/controllers/corporationController.ts](server/src/controllers/corporationController.ts)):
    - GET /api/corporations/:corpId - Get corporation details
    - POST /api/corporations/leave - Leave corporation
    - POST /api/corporations/invite - Invite player
    - POST /api/corporations/accept-invite - Accept invitation
    - POST /api/corporations/kick - Kick member
    - POST /api/corporations/change-rank - Promote/demote member
    - POST /api/corporations/transfer-ownership - Transfer ownership
  - **Frontend UI** ([client/src/components/CorporationPanel.tsx](client/src/components/CorporationPanel.tsx)):
    - Full-screen modal with cyberpunk styling
    - Members tab showing all members with rank badges
    - Invite tab for founder/officers to invite players
    - Leave corporation button (disabled for founders)
    - Inline member management: promote, demote, kick, transfer buttons
    - Real-time updates after actions
    - ★ CORP button in GameDashboard header (yellow/gold theme)
  - **Permission System:**
    - Founder: Full control (promote, demote, kick, transfer ownership)
    - Officer: Can invite players and kick members (not other officers)
    - Member: View only, can leave corporation
  - **Automated Test Suite** ([server/src/__tests__/corporation.test.ts](server/src/__tests__/corporation.test.ts)):
    - 22 comprehensive tests covering all corporation operations
    - Tests for get details, leave, invite, accept, kick, change rank, transfer
    - All tests passing with 100% coverage of features

**Previous Session:**
- ✅ Ship log system with unread alerts
- ✅ Port trading system with colonist recruitment
