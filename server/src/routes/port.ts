import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getPort, trade } from '../controllers/portController';

const router = Router();

// All port routes require authentication
router.use(authenticateToken);

// GET /api/ports/:sectorNumber - Get port information
router.get('/:sectorNumber', getPort);

// POST /api/ports/trade - Execute a trade
router.post('/trade', trade);

export default router;

