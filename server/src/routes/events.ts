import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import {
  getEvents,
  attackIncursionHandler,
  adminListEvents,
  adminForceStart,
  adminForceResolve,
  adminSetCooldown,
  adminGetEventSettings,
  adminSetEventsEnabled,
} from '../controllers/eventController';
import {
  adminListPatrols,
  adminSpawnPatrol,
  adminClearPatrols,
  adminGetSettings,
  adminUpdateSettings,
  adminGetLog,
} from '../services/smugglingService';

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

// Admin: event settings for a universe (enabled flag, cooldown).
// Registered before /admin/:id/resolve so "settings" is not read as an id.
router.get('/admin/settings', requireAdmin, adminGetEventSettings);
router.post('/admin/settings', requireAdmin, adminSetEventsEnabled);

// Admin: force resolve a live event
router.post('/admin/:id/resolve', requireAdmin, adminForceResolve);

// Admin: suppress event seeding in a universe { universeId, minutes }
router.post('/admin/cooldown', requireAdmin, adminSetCooldown);

// --- Admin: customs patrols (smuggling) ---

// Admin: list patrols (optionally per universe)
router.get('/admin/patrols', requireAdmin, async (req, res) => {
  try {
    const universeId = req.query.universeId ? Number(req.query.universeId) : undefined;
    res.json({ patrols: await adminListPatrols(universeId) });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Admin: force spawn a patrol { universeId, sectorNumber? }
router.post('/admin/patrols/spawn', requireAdmin, async (req, res) => {
  try {
    const { universeId, sectorNumber } = req.body || {};
    if (!universeId) return res.status(400).json({ error: 'universeId is required' });
    const patrol = await adminSpawnPatrol(
      Number(universeId),
      sectorNumber !== undefined ? Number(sectorNumber) : undefined
    );
    res.status(201).json({ patrol });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Admin: force clear all patrols in a universe { universeId }
router.post('/admin/patrols/clear', requireAdmin, async (req, res) => {
  try {
    const { universeId } = req.body || {};
    if (!universeId) return res.status(400).json({ error: 'universeId is required' });
    const removed = await adminClearPatrols(Number(universeId));
    res.json({ success: true, removed });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Admin: smuggling tuning (scan chance multiplier, patrol strength)
router.get('/admin/smuggling/settings', requireAdmin, async (req, res) => {
  try {
    const universeId = req.query.universeId ? Number(req.query.universeId) : NaN;
    if (!universeId) return res.status(400).json({ error: 'universeId is required' });
    res.json({ settings: await adminGetSettings(universeId) });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/admin/smuggling/settings', requireAdmin, async (req, res) => {
  try {
    const { universeId, scanChanceMultiplier, patrolCount } = req.body || {};
    if (!universeId) return res.status(400).json({ error: 'universeId is required' });
    const settings = await adminUpdateSettings(Number(universeId), {
      scanChanceMultiplier:
        scanChanceMultiplier !== undefined ? Number(scanChanceMultiplier) : undefined,
      patrolCount: patrolCount !== undefined ? Number(patrolCount) : undefined,
    });
    res.json({ settings });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Admin: smuggling log (confiscations, flagging, market flips, stashes)
router.get('/admin/smuggling/log', requireAdmin, async (req, res) => {
  try {
    const universeId = req.query.universeId ? Number(req.query.universeId) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    res.json({ log: await adminGetLog(universeId, limit) });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
