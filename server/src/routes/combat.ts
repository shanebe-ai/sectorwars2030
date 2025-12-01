import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  attackPlayer,
  getTargets,
  getHistory,
  checkCanAttack
} from '../controllers/combatController';

const router = Router();

// All combat routes require authentication
router.use(authenticateToken);

// Attack another player
router.post('/attack', attackPlayer);

// Get attackable targets in current sector
router.get('/targets', getTargets);

// Get combat history
router.get('/history', getHistory);

// Check if can attack specific target
router.get('/can-attack/:targetId', checkCanAttack);

export default router;

