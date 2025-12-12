/**
 * Player Trading Routes
 * Defines API endpoints for player-to-player trading operations
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  createOffer,
  getInbox,
  getOutbox,
  acceptTrade,
  attemptRobbery,
  cancelTrade,
  getHistory,
} from '../controllers/playerTradingController';

const router = Router();

// All player trading routes require authentication
router.use(authenticateToken);

// POST /api/player-trading/create - Create new trade offer
router.post('/create', createOffer);

// GET /api/player-trading/inbox/:playerId - Get received offers
router.get('/inbox/:playerId', getInbox);

// GET /api/player-trading/outbox/:playerId - Get sent offers
router.get('/outbox/:playerId', getOutbox);

// POST /api/player-trading/accept/:offerId - Accept a trade offer
router.post('/accept/:offerId', acceptTrade);

// POST /api/player-trading/rob/:offerId - Attempt to rob a trade
router.post('/rob/:offerId', attemptRobbery);

// POST /api/player-trading/cancel/:offerId - Cancel a trade offer
router.post('/cancel/:offerId', cancelTrade);

// GET /api/player-trading/history/:playerId - Get trade history
router.get('/history/:playerId', getHistory);

export default router;
