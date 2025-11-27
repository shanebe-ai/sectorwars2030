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
import { startPortRegeneration } from './services/portService';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// CORS allowed origins - support both localhost and network access
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://37.27.80.77:5173',
  'http://37.27.80.77:5174',
];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

const PORT = process.env.PORT || 3000;

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

// API Routes
app.get('/api', (req, res) => {
  res.json({ message: 'TradeWars 2030 API Server', version: '1.0.0' });
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

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });

  // Game event handlers will be added here
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════╗
║   TradeWars 2030 - Server                     ║
║   Port: ${PORT}                                    ║
║   Host: 0.0.0.0 (all interfaces)              ║
║   Environment: ${process.env.NODE_ENV || 'development'}                ║
╚════════════════════════════════════════════════╝
  `);
  
  // Start port stock regeneration (every 30 minutes)
  startPortRegeneration(30 * 60 * 1000);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  httpServer.close(async () => {
    await pool.end();
    process.exit(0);
  });
});

export { app, io };
