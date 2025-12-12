/**
 * Player Trading Controller
 *
 * HTTP handlers for player-to-player trading API endpoints
 */

import { Request, Response } from 'express';
import {
  createTradeOffer,
  getPlayerTradeOffers,
  acceptPlayerTrade,
  attemptPlayerRobbery,
  cancelPlayerTrade,
  getPlayerTradeHistory,
} from '../services/playerTradingService';

/**
 * POST /api/player-trading/create
 * Create a new trade offer
 */
export const createOffer = async (req: Request, res: Response) => {
  try {
    // 1. Extract and validate user auth
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Parse request body
    const {
      initiatorPlayerId,
      recipientPlayerId,
      sectorId,
      offers,
      requests,
      message,
    } = req.body;

    // 3. Validate required fields
    if (!initiatorPlayerId || !recipientPlayerId || !sectorId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // 4. Parse numeric fields
    const initiatorPlayerIdNum = parseInt(initiatorPlayerId);
    const recipientPlayerIdNum = parseInt(recipientPlayerId);
    const sectorIdNum = parseInt(sectorId);

    if (isNaN(initiatorPlayerIdNum) || isNaN(recipientPlayerIdNum) || isNaN(sectorIdNum)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    // 5. Validate offers and requests objects
    if (!offers || !requests) {
      return res.status(400).json({ error: 'Missing offers or requests' });
    }

    // 6. TODO: Verify user owns initiator player
    // const ownershipCheck = await pool.query(
    //   'SELECT id FROM players WHERE id = $1 AND user_id = $2',
    //   [initiatorPlayerIdNum, userId]
    // );
    // if (ownershipCheck.rows.length === 0) {
    //   return res.status(403).json({ error: 'You do not own this player' });
    // }

    // 7. Call service
    const result = await createTradeOffer(
      initiatorPlayerIdNum,
      recipientPlayerIdNum,
      sectorIdNum,
      {
        fuel: parseInt(offers.fuel) || 0,
        organics: parseInt(offers.organics) || 0,
        equipment: parseInt(offers.equipment) || 0,
        credits: parseInt(offers.credits) || 0,
      },
      {
        fuel: parseInt(requests.fuel) || 0,
        organics: parseInt(requests.organics) || 0,
        equipment: parseInt(requests.equipment) || 0,
        credits: parseInt(requests.credits) || 0,
      },
      message
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({
      success: true,
      message: 'Trade offer created',
      offer: result.offer,
    });
  } catch (error: any) {
    console.error('Error in createOffer:', error);
    res.status(500).json({ error: error.message || 'Failed to create trade offer' });
  }
};

/**
 * GET /api/player-trading/inbox/:playerId
 * Get incoming trade offers for a player
 */
export const getInbox = async (req: Request, res: Response) => {
  try {
    // 1. Extract and validate user auth
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Parse player ID
    const { playerId } = req.params;
    const playerIdNum = parseInt(playerId);

    if (isNaN(playerIdNum)) {
      return res.status(400).json({ error: 'Invalid player ID' });
    }

    // 3. TODO: Verify user owns this player

    // 4. Get inbox
    const offers = await getPlayerTradeOffers(playerIdNum, 'inbox');

    res.json({
      success: true,
      offers,
    });
  } catch (error: any) {
    console.error('Error in getInbox:', error);
    res.status(500).json({ error: error.message || 'Failed to get inbox' });
  }
};

/**
 * GET /api/player-trading/outbox/:playerId
 * Get outgoing trade offers for a player
 */
export const getOutbox = async (req: Request, res: Response) => {
  try {
    // 1. Extract and validate user auth
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Parse player ID
    const { playerId } = req.params;
    const playerIdNum = parseInt(playerId);

    if (isNaN(playerIdNum)) {
      return res.status(400).json({ error: 'Invalid player ID' });
    }

    // 3. TODO: Verify user owns this player

    // 4. Get outbox
    const offers = await getPlayerTradeOffers(playerIdNum, 'outbox');

    res.json({
      success: true,
      offers,
    });
  } catch (error: any) {
    console.error('Error in getOutbox:', error);
    res.status(500).json({ error: error.message || 'Failed to get outbox' });
  }
};

/**
 * POST /api/player-trading/accept/:offerId
 * Accept a trade offer
 */
export const acceptTrade = async (req: Request, res: Response) => {
  try {
    // 1. Extract and validate user auth
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Parse offer ID and player ID
    const { offerId } = req.params;
    const { playerId } = req.body;

    const offerIdNum = parseInt(offerId);
    const playerIdNum = parseInt(playerId);

    if (isNaN(offerIdNum) || isNaN(playerIdNum)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    // 3. TODO: Verify user owns this player

    // 4. Accept trade
    const result = await acceptPlayerTrade(offerIdNum, playerIdNum);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      message: result.message,
      player: result.recipientPlayer,
    });
  } catch (error: any) {
    console.error('Error in acceptTrade:', error);
    res.status(500).json({ error: error.message || 'Failed to accept trade' });
  }
};

/**
 * POST /api/player-trading/rob/:offerId
 * Attempt to rob a trade offer
 */
export const attemptRobbery = async (req: Request, res: Response) => {
  try {
    // 1. Extract and validate user auth
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Parse offer ID and player ID
    const { offerId } = req.params;
    const { playerId } = req.body;

    const offerIdNum = parseInt(offerId);
    const playerIdNum = parseInt(playerId);

    if (isNaN(offerIdNum) || isNaN(playerIdNum)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    // 3. TODO: Verify user owns this player

    // 4. Attempt robbery
    const result = await attemptPlayerRobbery(offerIdNum, playerIdNum);

    // Always return 200 for robbery attempts (success or combat)
    res.json(result);
  } catch (error: any) {
    console.error('Error in attemptRobbery:', error);
    res.status(500).json({
      success: false,
      outcome: 'robbery_combat',
      message: error.message || 'Failed to attempt robbery',
      error: error.message,
    });
  }
};

/**
 * POST /api/player-trading/cancel/:offerId
 * Cancel a trade offer
 */
export const cancelTrade = async (req: Request, res: Response) => {
  try {
    // 1. Extract and validate user auth
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Parse offer ID and player ID
    const { offerId } = req.params;
    const { playerId } = req.body;

    const offerIdNum = parseInt(offerId);
    const playerIdNum = parseInt(playerId);

    if (isNaN(offerIdNum) || isNaN(playerIdNum)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    // 3. TODO: Verify user owns this player

    // 4. Cancel trade
    const result = await cancelPlayerTrade(offerIdNum, playerIdNum);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    console.error('Error in cancelTrade:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel trade' });
  }
};

/**
 * GET /api/player-trading/history/:playerId
 * Get trade history for a player
 */
export const getHistory = async (req: Request, res: Response) => {
  try {
    // 1. Extract and validate user auth
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Parse player ID
    const { playerId } = req.params;
    const playerIdNum = parseInt(playerId);

    if (isNaN(playerIdNum)) {
      return res.status(400).json({ error: 'Invalid player ID' });
    }

    // 3. Parse optional limit query param
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    if (isNaN(limit) || limit < 1 || limit > 200) {
      return res.status(400).json({ error: 'Invalid limit (must be 1-200)' });
    }

    // 4. TODO: Verify user owns this player

    // 5. Get history
    const history = await getPlayerTradeHistory(playerIdNum, limit);

    res.json({
      success: true,
      history,
    });
  } catch (error: any) {
    console.error('Error in getHistory:', error);
    res.status(500).json({ error: error.message || 'Failed to get trade history' });
  }
};
