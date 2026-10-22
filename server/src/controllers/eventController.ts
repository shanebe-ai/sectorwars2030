import { Request, Response } from 'express';
import { pool } from '../db/connection';
import {
  getLiveEvents,
  listEvents,
  attackIncursion,
  forceStartEvent,
  forceResolveEvent,
  setEventCooldown,
  getEventSettings,
  setEventsEnabled,
  DynamicEventType,
} from '../services/dynamicEventService';

const getPlayerForUser = async (userId: number) => {
  const result = await pool.query(
    'SELECT id, universe_id FROM players WHERE user_id = $1',
    [userId]
  );
  return result.rows[0] || null;
};

/**
 * GET /api/events
 * Live events plus recent history for the player's universe.
 */
export const getEvents = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const player = await getPlayerForUser(userId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const live = await getLiveEvents(player.universe_id);
    const history = await listEvents(player.universe_id, 20);
    res.json({ live, history });
  } catch (error: any) {
    console.error('Error getting dynamic events:', error);
    res.status(500).json({ error: error.message || 'Failed to get dynamic events' });
  }
};

/**
 * POST /api/events/incursion/attack
 * Engage the alien incursion in the player's current sector.
 */
export const attackIncursionHandler = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const player = await getPlayerForUser(userId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const result = await attackIncursion(player.id);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    res.json(result);
  } catch (error: any) {
    console.error('Error attacking incursion:', error);
    res.status(500).json({ error: error.message || 'Failed to engage the incursion' });
  }
};

/**
 * GET /api/events/admin/all
 * Admin: event history across universes (or one universe via query).
 */
export const adminListEvents = async (req: Request, res: Response) => {
  try {
    const universeId = req.query.universeId ? parseInt(req.query.universeId as string) : undefined;
    const events = await listEvents(universeId, 100);
    res.json({ events });
  } catch (error: any) {
    console.error('Error listing events for admin:', error);
    res.status(500).json({ error: error.message || 'Failed to list events' });
  }
};

/**
 * POST /api/events/admin/force-start
 * Admin: start an event brewing in a universe right now.
 * Body: { universeId, type }
 */
export const adminForceStart = async (req: Request, res: Response) => {
  try {
    const { universeId, type } = req.body;
    if (!universeId || !['ion_storm', 'incursion', 'port_strike'].includes(type)) {
      return res.status(400).json({ error: 'universeId and a valid type (ion_storm, incursion, port_strike) are required' });
    }

    const event = await forceStartEvent(parseInt(universeId), type as DynamicEventType);
    if (!event) {
      return res.status(409).json({ error: 'Could not start event: concurrency cap reached or no legal target in that universe' });
    }
    res.json({ event });
  } catch (error: any) {
    console.error('Error force starting event:', error);
    res.status(500).json({ error: error.message || 'Failed to force start event' });
  }
};

/**
 * POST /api/events/admin/:id/resolve
 * Admin: force resolve a live event, applying its aftermath.
 */
export const adminForceResolve = async (req: Request, res: Response) => {
  try {
    const eventId = parseInt(req.params.id);
    if (isNaN(eventId)) {
      return res.status(400).json({ error: 'Invalid event id' });
    }

    const resolved = await forceResolveEvent(eventId);
    if (!resolved) {
      return res.status(404).json({ error: 'Live event not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error force resolving event:', error);
    res.status(500).json({ error: error.message || 'Failed to force resolve event' });
  }
};

/**
 * POST /api/events/admin/cooldown
 * Admin: suppress new event seeding in a universe.
 * Body: { universeId, minutes }
 */
export const adminSetCooldown = async (req: Request, res: Response) => {
  try {
    const { universeId, minutes } = req.body;
    if (!universeId || typeof minutes !== 'number' || minutes < 0) {
      return res.status(400).json({ error: 'universeId and a non-negative minutes value are required' });
    }

    await setEventCooldown(parseInt(universeId), minutes);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error setting event cooldown:', error);
    res.status(500).json({ error: error.message || 'Failed to set cooldown' });
  }
};

/**
 * GET /api/events/admin/settings?universeId=
 * Admin: current event settings for a universe (enabled flag and
 * seeding cooldown).
 */
export const adminGetEventSettings = async (req: Request, res: Response) => {
  try {
    const universeId = req.query.universeId ? parseInt(req.query.universeId as string) : NaN;
    if (!universeId) {
      return res.status(400).json({ error: 'universeId is required' });
    }

    const settings = await getEventSettings(universeId);
    res.json({ settings });
  } catch (error: any) {
    console.error('Error getting event settings:', error);
    res.status(500).json({ error: error.message || 'Failed to get event settings' });
  }
};

/**
 * POST /api/events/admin/settings
 * Admin: switch event seeding on or off in a universe.
 * Body: { universeId, enabled }
 */
export const adminSetEventsEnabled = async (req: Request, res: Response) => {
  try {
    const { universeId, enabled } = req.body;
    if (!universeId || typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'universeId and a boolean enabled value are required' });
    }

    const settings = await setEventsEnabled(parseInt(universeId), enabled);
    res.json({ settings });
  } catch (error: any) {
    console.error('Error setting events enabled:', error);
    res.status(500).json({ error: error.message || 'Failed to set events enabled' });
  }
};
