import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { pool } from './db/connection';
import authRoutes from './routes/auth';
import universeRoutes from './routes/universe';
import playerRoutes from './routes/player';
import sectorRoutes from './routes/sector';
import portRoutes from './routes/port';
import messageRoutes from './routes/messages';
import stardockRoutes from './routes/stardock';
import shipLogRoutes from './routes/shipLog';
import pathfindingRoutes from './routes/pathfinding';
import planetRoutes from './routes/planet';
import bankingRoutes from './routes/banking';
import combatRoutes from './routes/combat';
import cargoRoutes from './routes/cargo';
import beaconRoutes from './routes/beacon';
import sectorFighterRoutes from './routes/sectorFighters';
import mineRoutes from './routes/mines';
import alienRoutes from './routes/alien';
import alienTradingRoutes from './routes/alienTrading';
import tradeRoutes from './routes/trade';
import corporationRoutes from './routes/corporation';
import bountyRoutes from './routes/bounty';
import genesisRoutes from './routes/genesis';
import leaderboardRoutes from './routes/leaderboard';
import playerTradingRoutes from './routes/playerTrading';
import eventRoutes from './routes/events';
import npcRoutes from './routes/npcs';
import seasonRoutes from './routes/seasons';
import { apiLimiter, parseTrustProxy } from './middleware/rateLimit';
import { startPortRegeneration } from './services/portService';
import { startFighterMaintenance } from './services/maintenanceService';
import { startEconomyTick } from './services/economyService';
import { startDerelictTick } from './services/derelictService';
import { startAnomalyTick } from './services/anomalyService';
import { startDynamicEventTick } from './services/dynamicEventService';
import smugglingRoutes from './routes/smuggling';
import { startSmugglingTick } from './services/smugglingService';
import { startNpcTick } from './services/npcService';
import { startSeasonTick } from './services/seasonService';
import { startAlienShipMovement, startAlienAggression } from './services/alienService';
import { cleanupExpiredOffers } from './services/alienTradingService';
import { cleanupExpiredPlayerTrades } from './services/playerTradingService';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// CORS allowed origins - support localhost and network access
// Keep in sync with any externally exposed host/port used by clients
// CORS_ORIGIN_CLIENT / CORS_ORIGIN_ADMIN override for deployments;
// localhost dev defaults are always kept as a fallback.
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://37.27.80.77:5173',
  'http://37.27.80.77:5174',
  'http://37.27.80.77:5175',
  'http://37.27.80.77:5176',
  // add bare-IP without port to allow socket probing from default origins
  'http://37.27.80.77',
];

const allowedOrigins = Array.from(new Set([
  ...(process.env.CORS_ORIGIN_CLIENT ? [process.env.CORS_ORIGIN_CLIENT] : []),
  ...(process.env.CORS_ORIGIN_ADMIN ? [process.env.CORS_ORIGIN_ADMIN] : []),
  ...defaultOrigins,
]));

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

const PORT = parseInt(process.env.PORT || '3000', 10);

// Trust X-Forwarded-For from a local proxy (nginx) so rate limits see
// the real client IP. Override with TRUST_PROXY (true, false, a hop
// count, or an Express trust proxy list).
app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected' });
  }
});

// Rate limit the whole API (health check above stays unlimited)
app.use('/api', apiLimiter);

// API Routes
app.get('/api', (req, res) => {
  res.json({ message: 'Sector Wars 2030: Moral Decay API Server', version: '1.0.0' });
});

// Auth routes
app.use('/api/auth', authRoutes);

// Universe routes
app.use('/api/universes', universeRoutes);

// Player routes
app.use('/api/players', playerRoutes);

// Sector routes
app.use('/api/sectors', sectorRoutes);

// Port routes
app.use('/api/ports', portRoutes);

// Message routes
app.use('/api/messages', messageRoutes);

// StarDock routes (ship/equipment purchases)
app.use('/api/stardock', stardockRoutes);

// Ship Log routes (discoveries and notes)
app.use('/api/shiplogs', shipLogRoutes);

// Pathfinding routes (plot course)
app.use('/api/pathfinding', pathfindingRoutes);

// Planet routes (colonization, production)
app.use('/api/planets', planetRoutes);

// Banking routes (StarDock banking system)
app.use('/api/banking', bankingRoutes);

// Combat routes (player vs player combat)
app.use('/api/combat', combatRoutes);

// Cargo routes (floating cargo pickup/jettison)
app.use('/api/cargo', cargoRoutes);

// Beacon routes (personal beacons with messages)
app.use('/api/beacons', beaconRoutes);

// Sector fighter routes (deploy/attack stationed fighters)
app.use('/api/sector-fighters', sectorFighterRoutes);

// Mine routes (purchase/deploy mines)
app.use('/api/mines', mineRoutes);

// Alien routes (alien communications and encounters)
app.use('/api/aliens', alienRoutes);

// Alien trading routes (trade with aliens)
app.use('/api/alien-trading', alienTradingRoutes);

// Player trading routes (player-to-player trading)
app.use('/api/trade', tradeRoutes);

// Corporation routes (corp management)
app.use('/api/corporations', corporationRoutes);

// Bounty routes (bounty contracts and board)
app.use('/api/bounties', bountyRoutes);

// Genesis routes (genesis torpedoes)
app.use('/api/genesis', genesisRoutes);

// Leaderboard routes
app.use('/api/leaderboard', leaderboardRoutes);

// Player-to-player trading routes (offers, inbox, accept, rob)
app.use('/api/player-trading', playerTradingRoutes);

// Dynamic event routes (storms, incursions, strikes, admin controls)
app.use('/api/events', eventRoutes);
app.use('/api/smuggling', smugglingRoutes);

// NPC trader routes (hails)
app.use('/api/npcs', npcRoutes);

// Season routes (current season, Hall of Fame, admin controls)
app.use('/api/seasons', seasonRoutes);

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  // Player joins a sector room to receive notifications
  socket.on('join_sector', async (data: { universeId: number; sectorNumber: number; playerId: number }) => {
    const sectorRoomName = `universe_${data.universeId}_sector_${data.sectorNumber}`;
    const universeRoomName = `universe_${data.universeId}`;
    const playerRoomName = `player_${data.playerId}`;

    // Leave any previous sector rooms for this universe
    socket.rooms.forEach(room => {
      if (room.startsWith(`universe_${data.universeId}_sector_`)) {
        socket.leave(room);
      }
    });

    // Join the universe room (for broadcasts), sector room, and personal player room
    socket.join(universeRoomName);
    socket.join(sectorRoomName);
    socket.join(playerRoomName);
    console.log(`[WS] Player ${data.playerId} joined ${sectorRoomName} and personal room`);

    // Store player info on socket for later use
    (socket as any).playerData = data;
  });

  // Player leaves sector (called before moving)
  socket.on('leave_sector', (data: { universeId: number; sectorNumber: number }) => {
    const roomName = `universe_${data.universeId}_sector_${data.sectorNumber}`;
    socket.leave(roomName);
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

// Export function to emit sector events from other parts of the app
export const emitSectorEvent = (
  universeId: number,
  sectorNumber: number,
  event: string,
  data: any
) => {
  const roomName = `universe_${universeId}_sector_${sectorNumber}`;
  io.to(roomName).emit(event, data);
};

// Export function to emit universe-wide events (e.g., broadcasts)
export const emitUniverseEvent = (
  universeId: number,
  event: string,
  data: any
) => {
  const roomName = `universe_${universeId}`;
  io.to(roomName).emit(event, data);
};

// Export function to emit player-specific events (e.g., combat notifications)
export const emitPlayerEvent = (
  playerId: number,
  event: string,
  data: any
) => {
  const roomName = `player_${playerId}`;
  io.to(roomName).emit(event, data);
};

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server (skip when imported by tests)
if (process.env.NODE_ENV !== 'test' && process.env.JEST_WORKER_ID === undefined) {
httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║   Sector Wars 2030 - Server                   ║
║   Port: ${PORT}                                    ║
║   Host: 0.0.0.0 (all interfaces)              ║
║   Environment: ${process.env.NODE_ENV || 'development'}                ║
╚════════════════════════════════════════════════╝
  `);
  
  // Start port stock regeneration (every 30 minutes)
  startPortRegeneration(30 * 60 * 1000);

  // Start fighter maintenance charging (daily - 24 hours)
  startFighterMaintenance(24 * 60 * 60 * 1000);

  // Start living economy tick (every 5 minutes: restock, drift decay, events, bounty expiry)
  startEconomyTick(5 * 60 * 1000);

  // Start derelict tick (every 5 minutes: expiry and spawning)
  startDerelictTick(5 * 60 * 1000);

  // Start anomaly tick (every 5 minutes: dissipation, radiation decay, formation)
  startAnomalyTick(5 * 60 * 1000);

  // Start dynamic event tick (every 5 minutes: seed, advance, resolve events)
  startDynamicEventTick(5 * 60 * 1000);
  startSmugglingTick(5 * 60 * 1000);

  // Start NPC traffic tick (every 5 minutes: NPC traders move and trade)
  startNpcTick(5 * 60 * 1000);

  // Start season tick (every 5 minutes: end warnings, season end and archive)
  startSeasonTick(5 * 60 * 1000);

  // Start alien ship movement (every 5 minutes)
  startAlienShipMovement(5 * 60 * 1000);

  // Start alien aggression (every 10 minutes, offset by 2 minutes)
  startAlienAggression(10 * 60 * 1000);

  // Start alien trade offer cleanup (every 1 minute)
  setInterval(async () => {
    try {
      await cleanupExpiredOffers();
      await cleanupExpiredPlayerTrades();
    } catch (error) {
      console.error('[Trading] Error cleaning up expired offers:', error);
    }
  }, 60 * 1000); // 1 minute
});
} // end if (not test mode)

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  httpServer.close(async () => {
    await pool.end();
    process.exit(0);
  });
});

export { app, io };
