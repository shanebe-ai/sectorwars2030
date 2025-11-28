import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getPort, trade, getColonists, purchaseColonists } from '../controllers/portController';

const router = Router();

// All port routes require authentication
router.use(authenticateToken);

// Colonist routes (must be before :sectorNumber to avoid conflicts)
// GET /api/ports/colonists - Get colonist purchase info
router.get('/colonists', getColonists);

// POST /api/ports/colonists/buy - Purchase colonists
router.post('/colonists/buy', purchaseColonists);

// GET /api/ports/:sectorNumber - Get port information
router.get('/:sectorNumber', getPort);

// POST /api/ports/trade - Execute a trade
router.post('/trade', trade);

export default router;

