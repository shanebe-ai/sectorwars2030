/**
 * Corporation Routes
 * Routes for corporation management
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getCorpDetails,
  leave,
  invite,
  acceptInvite,
  kick,
  changeRankEndpoint,
  transferOwnershipEndpoint
} from '../controllers/corporationController';

const router = Router();

// All corporation routes require authentication
router.use(authenticateToken);

// GET /api/corporations/:corpId - Get corporation details with members
router.get('/:corpId', getCorpDetails);

// POST /api/corporations/leave - Leave current corporation
router.post('/leave', leave);

// POST /api/corporations/invite - Invite player to corporation
router.post('/invite', invite);

// POST /api/corporations/accept-invite - Accept corporation invitation
router.post('/accept-invite', acceptInvite);

// POST /api/corporations/kick - Kick member from corporation
router.post('/kick', kick);

// POST /api/corporations/change-rank - Promote or demote member
router.post('/change-rank', changeRankEndpoint);

// POST /api/corporations/transfer-ownership - Transfer ownership
router.post('/transfer-ownership', transferOwnershipEndpoint);

export default router;
