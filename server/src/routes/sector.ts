import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { getSectorDetails, moveToSector, scanSector } from '../controllers/sectorController';

const router = express.Router();

// All sector routes require authentication
router.use(authenticateToken);

/**
 * GET /api/sectors/:sectorNumber
 * Get details about a specific sector including warps and players
 */
router.get('/:sectorNumber', getSectorDetails);

/**
 * POST /api/sectors/move
 * Move player to a new sector
 */
router.post('/move', moveToSector);

/**
 * POST /api/sectors/scan/:sectorNumber
 * Scan an adjoining sector (costs 1 turn, shows sector info without moving)
 */
router.post('/scan/:sectorNumber', scanSector);

export default router;
