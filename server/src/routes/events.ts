import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import {
  getEvents,
  attackIncursionHandler,
  adminListEvents,
  adminForceStart,
  adminForceResolve,
  adminSetCooldown,
} from '../controllers/eventController';

const router = Router();

// All event routes require authentication
router.use(authenticateToken);

// GET /api/events - Live events and history for the player's universe
router.get('/', getEvents);

// POST /api/events/incursion/attack - Engage the incursion in your sector
router.post('/incursion/attack', attackIncursionHandler);

// Admin: event history across universes
router.get('/admin/all', requireAdmin, adminListEvents);

// Admin: force an event to start brewing now { universeId, type }
router.post('/admin/force-start', requireAdmin, adminForceStart);

// Admin: force resolve a live event
router.post('/admin/:id/resolve', requireAdmin, adminForceResolve);

// Admin: suppress event seeding in a universe { universeId, minutes }
router.post('/admin/cooldown', requireAdmin, adminSetCooldown);

export default router;
