import { Request, Response } from 'express';
import { findPath, getPathDetails } from '../services/pathfindingService';
import { pool } from '../db/connection';

/**
 * Find shortest path between two sectors
 * POST /api/pathfinding/plot
 */
export const plotCourse = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { destinationSector } = req.body;

    if (!destinationSector || typeof destinationSector !== 'number') {
      return res.status(400).json({ error: 'Destination sector is required' });
    }

    // Get player's current sector and universe
    const playerResult = await pool.query(
      'SELECT id, current_sector, universe_id FROM players WHERE user_id = $1',
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const player = playerResult.rows[0];
    const currentSector = player.current_sector;
    const universeId = player.universe_id;
    const playerId = player.id;

    // Find the path
    const path = await findPath(currentSector, destinationSector, universeId);

    if (!path) {
      return res.status(404).json({ error: 'No path found to destination sector' });
    }

    // Get detailed information about the path
    const sectors = await getPathDetails(path, universeId, playerId);

    res.json({
      success: true,
      path,
      sectors,
      distance: path.length - 1, // Number of warps (exclude starting sector)
      currentSector,
      destinationSector
    });
  } catch (error: any) {
    console.error('Error plotting course:', error);
    res.status(500).json({ error: error.message || 'Failed to plot course' });
  }
};
