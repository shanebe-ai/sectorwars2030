import { Router } from 'express';
import * as stardockController from '../controllers/stardockController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/stardock - Get StarDock info (ships, prices)
router.get('/', stardockController.getStardockInfo);

// POST /api/stardock/ship - Purchase a ship
router.post('/ship', stardockController.purchaseShip);

// POST /api/stardock/fighters - Purchase fighters
router.post('/fighters', stardockController.purchaseFighters);

// POST /api/stardock/shields - Purchase shields
router.post('/shields', stardockController.purchaseShields);

export default router;

