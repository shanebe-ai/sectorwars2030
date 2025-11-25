import { Router } from 'express';
import {
  createUniverse,
  getUniverses,
  getUniverse,
  removeUniverse,
} from '../controllers/universeController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/', getUniverses); // List all universes
router.get('/:id', getUniverse); // Get specific universe

// Protected routes (require authentication)
router.post('/', authenticateToken, createUniverse); // Create universe (admin only)
router.delete('/:id', authenticateToken, removeUniverse); // Delete universe (admin only)

export default router;
