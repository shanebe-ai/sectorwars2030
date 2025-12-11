/**
 * Alien Trading Routes
 * Defines API endpoints for alien trading operations
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getOffers,
  acceptTrade,
  attemptRobbery,
  cancelTrade,
  getHistory
} from '../controllers/alienTradingController';

const router = Router();

// All alien trading routes require authentication
router.use(authenticateToken);

// GET /api/alien-trading/offers/:playerId - Get active trade offers
router.get('/offers/:playerId', getOffers);

// POST /api/alien-trading/accept/:offerId - Accept a trade offer
router.post('/accept/:offerId', acceptTrade);

// POST /api/alien-trading/rob/:offerId - Attempt to rob an alien trader
router.post('/rob/:offerId', attemptRobbery);

// POST /api/alien-trading/cancel/:offerId - Cancel a pending offer
router.post('/cancel/:offerId', cancelTrade);

// GET /api/alien-trading/history/:playerId - Get trade history
router.get('/history/:playerId', getHistory);

export default router;
