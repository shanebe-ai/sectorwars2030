import { Request, Response } from 'express';
import * as messageService from '../services/messageService';
import { pool } from '../db/connection';

/**
 * Get player ID from user ID
 */
async function getPlayerIdFromUser(userId: number): Promise<number | null> {
  const result = await pool.query(
    'SELECT id FROM players WHERE user_id = $1',
    [userId]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

/**
 * Send a message to another player
 * POST /api/messages
 */
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const playerId = await getPlayerIdFromUser(userId);
    if (!playerId) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const { recipientId, subject, body } = req.body;

    if (!recipientId || typeof recipientId !== 'number') {
      return res.status(400).json({ error: 'Invalid recipient ID' });
    }

    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return res.status(400).json({ error: 'Message body is required' });
    }

    if (body.length > 2000) {
      return res.status(400).json({ error: 'Message body too long (max 2000 characters)' });
    }

    if (subject && subject.length > 200) {
      return res.status(400).json({ error: 'Subject too long (max 200 characters)' });
    }

    if (recipientId === playerId) {
      return res.status(400).json({ error: 'Cannot send message to yourself' });
    }

    const message = await messageService.sendMessage({
      senderId: playerId,
      recipientId,
      subject: subject?.trim(),
      body: body.trim()
    });

    res.status(201).json({
      success: true,
      message
    });
  } catch (error: any) {
    console.error('Error sending message:', error);
    res.status(400).json({ error: error.message || 'Failed to send message' });
  }
};

/**
 * Get inbox messages
 * GET /api/messages/inbox
 */
export const getInbox = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const playerId = await getPlayerIdFromUser(userId);
    if (!playerId) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const messages = await messageService.getInbox(playerId);

    res.json({
      success: true,
      messages
    });
  } catch (error) {
    console.error('Error getting inbox:', error);
    res.status(500).json({ error: 'Failed to get inbox' });
  }
};

/**
 * Get sent messages
 * GET /api/messages/sent
 */
export const getSentMessages = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const playerId = await getPlayerIdFromUser(userId);
    if (!playerId) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const messages = await messageService.getSentMessages(playerId);

    res.json({
      success: true,
      messages
    });
  } catch (error) {
    console.error('Error getting sent messages:', error);
    res.status(500).json({ error: 'Failed to get sent messages' });
  }
};

/**
 * Get a specific message
 * GET /api/messages/:id
 */
export const getMessage = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const playerId = await getPlayerIdFromUser(userId);
    if (!playerId) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const messageId = parseInt(req.params.id, 10);
    if (isNaN(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    const message = await messageService.getMessage(messageId, playerId);

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json({
      success: true,
      message
    });
  } catch (error) {
    console.error('Error getting message:', error);
    res.status(500).json({ error: 'Failed to get message' });
  }
};

/**
 * Mark a message as read
 * PUT /api/messages/:id/read
 */
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const playerId = await getPlayerIdFromUser(userId);
    if (!playerId) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const messageId = parseInt(req.params.id, 10);
    if (isNaN(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    const success = await messageService.markAsRead(messageId, playerId);

    if (!success) {
      return res.status(404).json({ error: 'Message not found or not authorized' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
};

/**
 * Delete a message
 * DELETE /api/messages/:id
 */
export const deleteMessage = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const playerId = await getPlayerIdFromUser(userId);
    if (!playerId) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const messageId = parseInt(req.params.id, 10);
    if (isNaN(messageId)) {
      return res.status(400).json({ error: 'Invalid message ID' });
    }

    const success = await messageService.deleteMessage(messageId, playerId);

    if (!success) {
      return res.status(404).json({ error: 'Message not found or not authorized' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
};

/**
 * Get unread message count
 * GET /api/messages/unread-count
 */
export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const playerId = await getPlayerIdFromUser(userId);
    if (!playerId) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const count = await messageService.getUnreadCount(playerId);

    res.json({
      success: true,
      unreadCount: count
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
};

/**
 * Get players in the same sector (for composing messages)
 * GET /api/messages/players-in-sector
 */
export const getPlayersInSector = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const playerId = await getPlayerIdFromUser(userId);
    if (!playerId) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const players = await messageService.getPlayersInSector(playerId);

    res.json({
      success: true,
      players
    });
  } catch (error) {
    console.error('Error getting players in sector:', error);
    res.status(500).json({ error: 'Failed to get players in sector' });
  }
};

