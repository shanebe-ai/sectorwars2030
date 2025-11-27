import { Router } from 'express';
import * as pathfindingController from '../controllers/pathfindingController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// POST /api/pathfinding/plot - Find shortest path to destination
router.post('/plot', pathfindingController.plotCourse);

export default router;
