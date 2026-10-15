import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { postBounty, getBoard, getHunters } from '../controllers/bountyController';

const router = Router();

// All bounty routes require authentication
router.use(authenticateToken);

// GET /api/bounties/board - Public bounty board
router.get('/board', getBoard);

// GET /api/bounties/hunters - Hunter leaderboard
router.get('/hunters', getHunters);

// POST /api/bounties - Place a bounty
router.post('/', postBounty);

export default router;
