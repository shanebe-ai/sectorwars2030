import { Request, Response } from 'express';
import { pool } from '../db/connection';
import { hailNpc } from '../services/npcService';

/**
 * POST /api/npcs/hail
 * Hail an NPC trader in the player's current sector for a market tip.
 * Body: { npcId }
 */
export const hail = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const npcId = parseInt(req.body?.npcId);
    if (isNaN(npcId)) {
      return res.status(400).json({ error: 'npcId is required' });
    }

    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1',
      [userId]
    );
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const result = await hailNpc(playerResult.rows[0].id, npcId);
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    res.json(result);
  } catch (error: any) {
    console.error('Error hailing NPC:', error);
    res.status(500).json({ error: error.message || 'Failed to hail trader' });
  }
};
