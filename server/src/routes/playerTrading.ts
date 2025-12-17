/**
 * Trade Routes
 * Defines API endpoints for player-to-player trading operations
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  createOffer,
  getInbox,
  getOutbox,
  getAllOffers,
  acceptTrade,
  attemptRobbery,
  cancelTrade,
  getHistory,
} from '../controllers/playerTradingController';

const router = Router();

// All player trading routes require authentication
router.use(authenticateToken);

// POST /api/trade/create - Create new trade offer
router.post('/create', createOffer);

// GET /api/trade/inbox/:playerId - Get received offers
router.get('/inbox/:playerId', getInbox);

// GET /api/trade/outbox/:playerId - Get sent offers
router.get('/outbox/:playerId', getOutbox);

// POST /api/trade/accept/:offerId - Accept a trade offer
router.post('/accept/:offerId', acceptTrade);

// POST /api/trade/rob/:offerId - Attempt to rob a trade
router.post('/rob/:offerId', attemptRobbery);

// POST /api/trade/cancel/:offerId - Cancel a trade offer
router.post('/cancel/:offerId', cancelTrade);

// GET /api/trade/history/:playerId - Get trade history
router.get('/history/:playerId', getHistory);

// GET /api/trade/offers - Get all trade offers for current player
router.get('/offers', getAllOffers);

export default router;
