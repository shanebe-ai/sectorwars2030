/**
 * Alien Trading Controller
 * Handles HTTP requests for alien trading operations
 */

import { Request, Response } from 'express';
import {
  getPlayerTradeOffers,
  getTradeOfferById,
  acceptAlienTrade,
  attemptAlienRobbery,
  cancelAlienTrade,
  getPlayerTradeHistory
} from '../services/alienTradingService';
import { alienAttacksPlayer } from '../services/alienService';

/**
 * GET /api/alien-trading/offers/:playerId
 * Get active trade offers for a player
 */
export const getOffers = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { playerId } = req.params;
    const playerIdNum = parseInt(playerId);

    if (isNaN(playerIdNum)) {
      return res.status(400).json({ error: 'Invalid player ID' });
    }

    // TODO: Verify the user owns this player
    // For now, trust the playerId from params

    const offers = await getPlayerTradeOffers(playerIdNum);

    res.json({ success: true, offers });
  } catch (error: any) {
    console.error('Error getting trade offers:', error);
    res.status(500).json({ error: error.message || 'Failed to get trade offers' });
  }
};

/**
 * POST /api/alien-trading/accept/:offerId
 * Accept an alien trade offer
 */
export const acceptTrade = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { offerId } = req.params;
    const { playerId } = req.body;

    const offerIdNum = parseInt(offerId);
    const playerIdNum = parseInt(playerId);

    if (isNaN(offerIdNum) || isNaN(playerIdNum)) {
      return res.status(400).json({ error: 'Invalid offer or player ID' });
    }

    const result = await acceptAlienTrade(offerIdNum, playerIdNum);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    console.error('Error accepting trade:', error);
    res.status(500).json({ error: error.message || 'Failed to accept trade' });
  }
};

/**
 * POST /api/alien-trading/rob/:offerId
 * Attempt to rob an alien trader
 */
export const attemptRobbery = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { offerId } = req.params;
    const { playerId } = req.body;

    const offerIdNum = parseInt(offerId);
    const playerIdNum = parseInt(playerId);

    if (isNaN(offerIdNum) || isNaN(playerIdNum)) {
      return res.status(400).json({ error: 'Invalid offer or player ID' });
    }

    const result = await attemptAlienRobbery(offerIdNum, playerIdNum);

    if (!result.success) {
      return res.status(400).json(result);
    }

    // If robbery triggered combat, execute it
    if (result.outcome === 'robbery_combat' && result.combatData) {
      try {
        const combatResult = await alienAttacksPlayer(
          result.combatData.alienShipId,
          result.combatData.playerId,
          result.combatData.robberPenalty // Apply penalty to player
        );

        return res.json({
          success: true,
          outcome: 'robbery_combat',
          message: result.message,
          combatResult
        });
      } catch (combatError: any) {
        console.error('Error executing robbery combat:', combatError);
        return res.status(500).json({
          error: 'Robbery triggered combat but combat failed: ' + combatError.message
        });
      }
    }

    // Robbery succeeded
    res.json(result);
  } catch (error: any) {
    console.error('Error attempting robbery:', error);
    res.status(500).json({ error: error.message || 'Failed to attempt robbery' });
  }
};

/**
 * POST /api/alien-trading/cancel/:offerId
 * Cancel a pending trade offer
 */
export const cancelTrade = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { offerId } = req.params;
    const { playerId } = req.body;

    const offerIdNum = parseInt(offerId);
    const playerIdNum = parseInt(playerId);

    if (isNaN(offerIdNum) || isNaN(playerIdNum)) {
      return res.status(400).json({ error: 'Invalid offer or player ID' });
    }

    const result = await cancelAlienTrade(offerIdNum, playerIdNum);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error: any) {
    console.error('Error cancelling trade:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel trade' });
  }
};

/**
 * GET /api/alien-trading/history/:playerId
 * Get trade history for a player
 */
export const getHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { playerId } = req.params;
    const playerIdNum = parseInt(playerId);

    if (isNaN(playerIdNum)) {
      return res.status(400).json({ error: 'Invalid player ID' });
    }

    const limit = parseInt(req.query.limit as string) || 50;

    const history = await getPlayerTradeHistory(playerIdNum, limit);

    res.json({ success: true, history, total: history.length });
  } catch (error: any) {
    console.error('Error getting trade history:', error);
    res.status(500).json({ error: error.message || 'Failed to get trade history' });
  }
};
