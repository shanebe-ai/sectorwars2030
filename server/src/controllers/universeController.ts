import { Request, Response } from 'express';
import {
  generateUniverse,
  getUniverseById,
  listUniverses,
  deleteUniverse,
} from '../services/universeService';

/**
 * POST /api/universes
 * Create a new universe with generated sectors
 */
export const createUniverse = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Only admins can create universes
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const {
      name,
      description,
      maxSectors,
      maxPlayers,
      turnsPerDay,
      startingCredits,
      startingShipType,
      portPercentage,
      allowDeadEnds,
    } = req.body;

    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Universe name is required' });
    }

    if (maxSectors && (maxSectors < 10 || maxSectors > 10000)) {
      return res.status(400).json({ error: 'Max sectors must be between 10 and 10000' });
    }

    console.log(`Admin ${req.user.username} creating universe: ${name}`);

    const result = await generateUniverse({
      name,
      description,
      maxSectors,
      maxPlayers,
      turnsPerDay,
      startingCredits,
      startingShipType,
      portPercentage,
      allowDeadEnds: allowDeadEnds === true,
      createdBy: req.user.userId,
    });

    res.status(201).json({
      message: 'Universe created successfully',
      universe: result.universe,
      stats: result.stats,
    });
  } catch (error) {
    console.error('Create universe error:', error);
    res.status(500).json({ error: 'Failed to create universe' });
  }
};

/**
 * GET /api/universes
 * List all universes with stats
 */
export const getUniverses = async (req: Request, res: Response) => {
  try {
    const universes = await listUniverses();

    res.json({
      universes,
      count: universes.length,
    });
  } catch (error) {
    console.error('Get universes error:', error);
    res.status(500).json({ error: 'Failed to fetch universes' });
  }
};

/**
 * GET /api/universes/:id
 * Get specific universe details
 */
export const getUniverse = async (req: Request, res: Response) => {
  try {
    const universeId = parseInt(req.params.id);

    if (isNaN(universeId)) {
      return res.status(400).json({ error: 'Invalid universe ID' });
    }

    const universe = await getUniverseById(universeId);

    if (!universe) {
      return res.status(404).json({ error: 'Universe not found' });
    }

    res.json({ universe });
  } catch (error) {
    console.error('Get universe error:', error);
    res.status(500).json({ error: 'Failed to fetch universe' });
  }
};

/**
 * DELETE /api/universes/:id
 * Delete a universe (admin only)
 */
export const removeUniverse = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Only admins can delete universes
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const universeId = parseInt(req.params.id);

    if (isNaN(universeId)) {
      return res.status(400).json({ error: 'Invalid universe ID' });
    }

    const deleted = await deleteUniverse(universeId);

    if (!deleted) {
      return res.status(404).json({ error: 'Universe not found' });
    }

    console.log(`Admin ${req.user.username} deleted universe ID: ${universeId}`);

    res.json({
      message: 'Universe deleted successfully',
      universeId,
    });
  } catch (error) {
    console.error('Delete universe error:', error);
    res.status(500).json({ error: 'Failed to delete universe' });
  }
};
