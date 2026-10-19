import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { hail } from '../controllers/npcController';

const router = Router();

// All NPC routes require authentication
router.use(authenticateToken);

// POST /api/npcs/hail - Hail an NPC trader in your sector { npcId }
router.post('/hail', hail);

export default router;
