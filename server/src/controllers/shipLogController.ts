import { Request, Response } from 'express';
import * as shipLogService from '../services/shipLogService';
import { pool } from '../db/connection';

// Helper to get player ID from user ID
async function getPlayerIdFromUser(userId: number): Promise<number | null> {
  const result = await pool.query(
    'SELECT id FROM players WHERE user_id = $1',
    [userId]
  );
  return result.rows[0]?.id || null;
}

// Helper to get player's universe ID
async function getPlayerUniverseId(playerId: number): Promise<number | null> {
  const result = await pool.query(
    'SELECT universe_id FROM players WHERE id = $1',
    [playerId]
  );
  return result.rows[0]?.universe_id || null;
}

/**
 * Get all ship logs for the current player
 * GET /api/shiplogs
 */
export const getShipLogs = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const playerId = await getPlayerIdFromUser(userId);
    if (!playerId) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const logs = await shipLogService.getShipLogs(playerId);
    const stats = await shipLogService.getLogStats(playerId);

    res.json({
      success: true,
      logs,
      stats
    });
  } catch (error: any) {
    console.error('Error getting ship logs:', error);
    res.status(500).json({ error: error.message || 'Failed to get ship logs' });
  }
};

/**
 * Get ship logs filtered by type
 * GET /api/shiplogs/type/:logType
 */
export const getShipLogsByType = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const playerId = await getPlayerIdFromUser(userId);
    if (!playerId) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const { logType } = req.params;
    const validTypes = ['SOL', 'PLANET', 'PORT', 'DEAD_END', 'STARDOCK', 'MANUAL'];
    
    if (!validTypes.includes(logType.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid log type' });
    }

    const logs = await shipLogService.getShipLogsByType(
      playerId, 
      logType.toUpperCase() as shipLogService.LogType
    );

    res.json({
      success: true,
      logs
    });
  } catch (error: any) {
    console.error('Error getting ship logs by type:', error);
    res.status(500).json({ error: error.message || 'Failed to get ship logs' });
  }
};

/**
 * Add a manual note
 * POST /api/shiplogs/note
 */
export const addManualNote = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const playerId = await getPlayerIdFromUser(userId);
    if (!playerId) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const universeId = await getPlayerUniverseId(playerId);
    if (!universeId) {
      return res.status(404).json({ error: 'Universe not found' });
    }

    const { sectorNumber, note } = req.body;

    if (!sectorNumber || sectorNumber < 1) {
      return res.status(400).json({ error: 'Valid sector number is required' });
    }

    if (!note || note.trim().length === 0) {
      return res.status(400).json({ error: 'Note is required' });
    }

    const entry = await shipLogService.addManualNote(playerId, universeId, sectorNumber, note.trim());

    res.json({
      success: true,
      entry
    });
  } catch (error: any) {
    console.error('Error adding manual note:', error);
    res.status(500).json({ error: error.message || 'Failed to add note' });
  }
};

/**
 * Delete a manual note
 * DELETE /api/shiplogs/:logId
 */
export const deleteManualNote = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const playerId = await getPlayerIdFromUser(userId);
    if (!playerId) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const logId = parseInt(req.params.logId);
    if (isNaN(logId)) {
      return res.status(400).json({ error: 'Invalid log ID' });
    }

    const deleted = await shipLogService.deleteManualNote(playerId, logId);

    if (!deleted) {
      return res.status(404).json({ error: 'Note not found or cannot be deleted' });
    }

    res.json({
      success: true,
      message: 'Note deleted'
    });
  } catch (error: any) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: error.message || 'Failed to delete note' });
  }
};

/**
 * Get log statistics
 * GET /api/shiplogs/stats
 */
export const getLogStats = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const playerId = await getPlayerIdFromUser(userId);
    if (!playerId) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const stats = await shipLogService.getLogStats(playerId);

    res.json({
      success: true,
      stats
    });
  } catch (error: any) {
    console.error('Error getting log stats:', error);
    res.status(500).json({ error: error.message || 'Failed to get stats' });
  }
};

/**
 * Get unread log count
 * GET /api/shiplogs/unread-count
 */
export const getUnreadLogCount = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const playerId = await getPlayerIdFromUser(userId);
    if (!playerId) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const unreadCount = await shipLogService.getUnreadLogCount(playerId);

    res.json({
      success: true,
      unreadCount
    });
  } catch (error: any) {
    console.error('Error getting unread log count:', error);
    res.status(500).json({ error: error.message || 'Failed to get unread count' });
  }
};

/**
 * Mark all logs as read
 * POST /api/shiplogs/mark-read
 */
export const markLogsAsRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const playerId = await getPlayerIdFromUser(userId);
    if (!playerId) {
      return res.status(404).json({ error: 'Player not found' });
    }

    await shipLogService.markAllLogsAsRead(playerId);

    res.json({
      success: true,
      message: 'All logs marked as read'
    });
  } catch (error: any) {
    console.error('Error marking logs as read:', error);
    res.status(500).json({ error: error.message || 'Failed to mark logs as read' });
  }
};

