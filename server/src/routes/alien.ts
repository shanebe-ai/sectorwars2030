/**
 * Alien Routes
 * Routes for alien communications and encounters
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getAlienComms,
  getAlienPresence,
  unlockComms,
  attackAlien
} from '../controllers/alienController';

const router = Router();

// All alien routes require authentication
router.use(authenticateToken);

// GET /api/aliens/comms - Get alien communications (if unlocked)
router.get('/comms', getAlienComms);

// GET /api/aliens/sector/:sectorNumber - Get alien presence in sector
router.get('/sector/:sectorNumber', getAlienPresence);

// POST /api/aliens/unlock - Unlock alien communications
router.post('/unlock', unlockComms);

// POST /api/aliens/attack - Attack an alien ship
router.post('/attack', attackAlien);

export default router;
