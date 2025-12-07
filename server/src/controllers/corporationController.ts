/**
 * Corporation Controller
 * Handles HTTP requests for corporation management
 */

import { Request, Response } from 'express';
import { pool } from '../db/connection';
import {
  getCorporationDetails,
  leaveCorporation,
  invitePlayer,
  acceptInvitation,
  kickMember,
  changeRank,
  transferOwnership,
  disbandCorporation
} from '../services/corporationService';

/**
 * GET /api/corporations/:corpId
 * Get corporation details including all members
 */
export async function getCorpDetails(req: Request, res: Response): Promise<void> {
  try {
    const corpId = parseInt(req.params.corpId);

    if (isNaN(corpId)) {
      res.status(400).json({ error: 'Invalid corporation ID' });
      return;
    }

    const corpDetails = await getCorporationDetails(corpId);
    res.json(corpDetails);
  } catch (error: any) {
    console.error('Error getting corporation details:', error);
    res.status(400).json({ error: error.message || 'Failed to get corporation details' });
  }
}

/**
 * POST /api/corporations/leave
 * Leave current corporation
 */
export async function leave(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get player ID
    const playerResult = await pool.query(`
      SELECT id FROM players WHERE user_id = $1
    `, [userId]);

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const playerId = playerResult.rows[0].id;
    const result = await leaveCorporation(playerId);

    res.json(result);
  } catch (error: any) {
    console.error('Error leaving corporation:', error);
    res.status(400).json({ error: error.message || 'Failed to leave corporation' });
  }
}

/**
 * POST /api/corporations/invite
 * Invite player to corporation
 */
export async function invite(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const { username } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    // Get player ID
    const playerResult = await pool.query(`
      SELECT id FROM players WHERE user_id = $1
    `, [userId]);

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const playerId = playerResult.rows[0].id;
    const result = await invitePlayer(playerId, username);

    res.json(result);
  } catch (error: any) {
    console.error('Error inviting player:', error);
    res.status(400).json({ error: error.message || 'Failed to invite player' });
  }
}

/**
 * POST /api/corporations/accept-invite
 * Accept corporation invitation
 */
export async function acceptInvite(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const { corpId } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!corpId || typeof corpId !== 'number') {
      res.status(400).json({ error: 'Valid corporation ID is required' });
      return;
    }

    // Get player ID
    const playerResult = await pool.query(`
      SELECT id FROM players WHERE user_id = $1
    `, [userId]);

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const playerId = playerResult.rows[0].id;
    const result = await acceptInvitation(playerId, corpId);

    res.json(result);
  } catch (error: any) {
    console.error('Error accepting invitation:', error);
    res.status(400).json({ error: error.message || 'Failed to accept invitation' });
  }
}

/**
 * POST /api/corporations/kick
 * Kick member from corporation
 */
export async function kick(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const { targetPlayerId } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!targetPlayerId || typeof targetPlayerId !== 'number') {
      res.status(400).json({ error: 'Valid target player ID is required' });
      return;
    }

    // Get player ID
    const playerResult = await pool.query(`
      SELECT id FROM players WHERE user_id = $1
    `, [userId]);

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const playerId = playerResult.rows[0].id;
    const result = await kickMember(playerId, targetPlayerId);

    res.json(result);
  } catch (error: any) {
    console.error('Error kicking member:', error);
    res.status(400).json({ error: error.message || 'Failed to kick member' });
  }
}

/**
 * POST /api/corporations/change-rank
 * Promote or demote member
 */
export async function changeRankEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const { targetPlayerId, newRank } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!targetPlayerId || typeof targetPlayerId !== 'number') {
      res.status(400).json({ error: 'Valid target player ID is required' });
      return;
    }

    if (!newRank || !['member', 'officer'].includes(newRank)) {
      res.status(400).json({ error: 'Valid rank is required (member or officer)' });
      return;
    }

    // Get player ID
    const playerResult = await pool.query(`
      SELECT id FROM players WHERE user_id = $1
    `, [userId]);

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const playerId = playerResult.rows[0].id;
    const result = await changeRank(playerId, targetPlayerId, newRank);

    res.json(result);
  } catch (error: any) {
    console.error('Error changing rank:', error);
    res.status(400).json({ error: error.message || 'Failed to change rank' });
  }
}

/**
 * POST /api/corporations/transfer-ownership
 * Transfer ownership to another member
 */
export async function transferOwnershipEndpoint(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const { newFounderId } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!newFounderId || typeof newFounderId !== 'number') {
      res.status(400).json({ error: 'Valid new founder player ID is required' });
      return;
    }

    // Get player ID
    const playerResult = await pool.query(`
      SELECT id FROM players WHERE user_id = $1
    `, [userId]);

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const playerId = playerResult.rows[0].id;
    const result = await transferOwnership(playerId, newFounderId);

    res.json(result);
  } catch (error: any) {
    console.error('Error transferring ownership:', error);
    res.status(400).json({ error: error.message || 'Failed to transfer ownership' });
  }
}

/**
 * POST /api/corporations/disband
 * Disband corporation (founder only)
 */
export async function disband(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get player ID
    const playerResult = await pool.query(`
      SELECT id FROM players WHERE user_id = $1
    `, [userId]);

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const playerId = playerResult.rows[0].id;
    const result = await disbandCorporation(playerId);

    res.json(result);
  } catch (error: any) {
    console.error('Error disbanding corporation:', error);
    res.status(400).json({ error: error.message || 'Failed to disband corporation' });
  }
}
