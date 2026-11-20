import express from 'express';
import {
  initializePlayer,
  getUserPlayers,
  getPlayer,
  checkPlayerInUniverse,
  searchPlayers,
  selectPlayer,
} from '../controllers/playerController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// All player routes require authentication
router.use(authenticateToken);

// POST /api/players - Create new player
router.post('/', initializePlayer);

// GET /api/players - Get all players for authenticated user
router.get('/', getUserPlayers);

// GET /api/players/search - Search players by username (must come before /:id)
router.get('/search', searchPlayers);

// GET /api/players/check/:universeId - Check if user has player in universe
router.get('/check/:universeId', checkPlayerInUniverse);

// POST /api/players/:id/select - Switch the active player (universe picker)
router.post('/:id/select', selectPlayer);

// GET /api/players/:id - Get specific player details
router.get('/:id', getPlayer);

export default router;
