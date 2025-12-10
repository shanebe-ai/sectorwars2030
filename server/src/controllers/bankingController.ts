import { Request, Response } from 'express';
import { pool } from '../db/connection';
import * as bankingService from '../services/bankingService';

/**
 * Get player's bank accounts (personal + corporate)
 */
export async function getBankAccounts(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get player ID from user ID
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1',
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const accounts = await bankingService.getPlayerBankAccounts(playerId);

    res.json({ accounts });
  } catch (error) {
    console.error('Error getting bank accounts:', error);
    res.status(500).json({ error: 'Failed to get bank accounts' });
  }
}

/**
 * Deposit credits to bank account
 */
export async function depositCredits(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get player ID from user ID
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1',
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const { accountType, amount } = req.body;

    if (!accountType || !amount) {
      return res.status(400).json({ error: 'accountType and amount are required' });
    }

    if (accountType !== 'personal' && accountType !== 'corporate') {
      return res.status(400).json({ error: 'Invalid account type' });
    }

    // Parse amount as integer to prevent string concatenation
    const numericAmount = parseInt(amount, 10);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    const result = await bankingService.depositCredits(playerId, accountType, numericAmount);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Get updated player credits to return to client
    const updatedPlayer = await pool.query(
      'SELECT credits FROM players WHERE id = $1',
      [playerId]
    );

    res.json({ 
      success: true, 
      transaction: result.transaction,
      player: { credits: updatedPlayer.rows[0].credits }
    });
  } catch (error) {
    console.error('Error depositing credits:', error);
    res.status(500).json({ error: 'Failed to deposit credits' });
  }
}

/**
 * Withdraw credits from bank account
 */
export async function withdrawCredits(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get player ID from user ID
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1',
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const { accountType, amount } = req.body;

    if (!accountType || !amount) {
      return res.status(400).json({ error: 'accountType and amount are required' });
    }

    if (accountType !== 'personal' && accountType !== 'corporate') {
      return res.status(400).json({ error: 'Invalid account type' });
    }

    // Parse amount as integer to prevent string concatenation
    const numericAmount = parseInt(amount, 10);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    const result = await bankingService.withdrawCredits(playerId, accountType, numericAmount);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Get updated player credits to return to client
    const updatedPlayer = await pool.query(
      'SELECT credits FROM players WHERE id = $1',
      [playerId]
    );

    res.json({ 
      success: true, 
      transaction: result.transaction,
      player: { credits: updatedPlayer.rows[0].credits }
    });
  } catch (error) {
    console.error('Error withdrawing credits:', error);
    res.status(500).json({ error: 'Failed to withdraw credits' });
  }
}

/**
 * Transfer credits to another player
 */
export async function transferCredits(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get player ID from user ID
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1',
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const { recipientId, amount, memo } = req.body;

    if (!recipientId || !amount) {
      return res.status(400).json({ error: 'recipientId and amount are required' });
    }

    const result = await bankingService.transferCredits(playerId, recipientId, amount, memo);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error transferring credits:', error);
    res.status(500).json({ error: 'Failed to transfer credits' });
  }
}

/**
 * Get transaction history for an account
 */
export async function getTransactionHistory(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get player ID from user ID
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1',
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const { accountId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    // Verify player owns this account
    const accounts = await bankingService.getPlayerBankAccounts(playerId);
    const hasAccess = accounts.some((acc: any) => acc.id === parseInt(accountId));

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this account' });
    }

    const transactions = await bankingService.getTransactionHistory(
      parseInt(accountId),
      limit,
      offset
    );

    res.json({ transactions });
  } catch (error) {
    console.error('Error getting transaction history:', error);
    res.status(500).json({ error: 'Failed to get transaction history' });
  }
}

/**
 * Search for players to transfer to
 */
export async function searchPlayers(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get player with universe_id from user ID
    const playerResult = await pool.query(
      'SELECT id, universe_id FROM players WHERE user_id = $1',
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const universeId = playerResult.rows[0].universe_id;
    const searchTerm = req.query.search as string;

    if (!searchTerm || searchTerm.length < 2) {
      return res.status(400).json({ error: 'Search term must be at least 2 characters' });
    }

    const players = await bankingService.searchPlayers(universeId, searchTerm, playerId);

    res.json({ players });
  } catch (error) {
    console.error('Error searching players:', error);
    res.status(500).json({ error: 'Failed to search players' });
  }
}
