import { Request, Response } from 'express';
import {
  placeBounty,
  getBountyBoard,
  getHunterLeaderboard,
  MIN_BOUNTY_AMOUNT,
} from '../services/bountyService';

/**
 * POST /api/bounties
 * Place a bounty on another player
 */
export const postBounty = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { targetPlayerId, amount, signed } = req.body;

    if (!targetPlayerId || !amount) {
      return res.status(400).json({ error: 'targetPlayerId and amount are required' });
    }

    const bounty = await placeBounty(userId, targetPlayerId, amount, !!signed);
    res.json({ bounty });
  } catch (error: any) {
    console.error('Error placing bounty:', error);
    res.status(400).json({ error: error.message || 'Failed to place bounty' });
  }
};

/**
 * GET /api/bounties/board
 * Get the public bounty board
 */
export const getBoard = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const board = await getBountyBoard(userId);
    res.json({ board, minAmount: MIN_BOUNTY_AMOUNT });
  } catch (error: any) {
    console.error('Error getting bounty board:', error);
    res.status(500).json({ error: error.message || 'Failed to get bounty board' });
  }
};

/**
 * GET /api/bounties/hunters
 * Get the hunter leaderboard
 */
export const getHunters = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const hunters = await getHunterLeaderboard(userId);
    res.json({ hunters });
  } catch (error: any) {
    console.error('Error getting hunter leaderboard:', error);
    res.status(500).json({ error: error.message || 'Failed to get leaderboard' });
  }
};
