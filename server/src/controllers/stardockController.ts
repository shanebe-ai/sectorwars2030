import { Request, Response } from 'express';
import * as stardockService from '../services/stardockService';

/**
 * Get StarDock information
 * GET /api/stardock
 */
export const getStardockInfo = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const info = await stardockService.getStardockInfo(userId);
    
    if (!info) {
      return res.status(400).json({ error: 'You are not at a StarDock' });
    }

    res.json({ success: true, ...info });
  } catch (error: any) {
    console.error('Error getting StarDock info:', error);
    res.status(500).json({ error: error.message || 'Failed to get StarDock info' });
  }
};

/**
 * Purchase a ship
 * POST /api/stardock/ship
 */
export const purchaseShip = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { shipName } = req.body;
    if (!shipName) {
      return res.status(400).json({ error: 'Ship name is required' });
    }

    const result = await stardockService.purchaseShip(userId, shipName);
    res.json(result);
  } catch (error: any) {
    console.error('Error purchasing ship:', error);
    res.status(400).json({ error: error.message || 'Failed to purchase ship' });
  }
};

/**
 * Purchase fighters
 * POST /api/stardock/fighters
 */
export const purchaseFighters = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { quantity } = req.body;
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Valid quantity is required' });
    }

    const result = await stardockService.purchaseFighters(userId, quantity);
    res.json(result);
  } catch (error: any) {
    console.error('Error purchasing fighters:', error);
    res.status(400).json({ error: error.message || 'Failed to purchase fighters' });
  }
};

/**
 * Purchase shields
 * POST /api/stardock/shields
 */
export const purchaseShields = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { quantity } = req.body;
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Valid quantity is required' });
    }

    const result = await stardockService.purchaseShields(userId, quantity);
    res.json(result);
  } catch (error: any) {
    console.error('Error purchasing shields:', error);
    res.status(400).json({ error: error.message || 'Failed to purchase shields' });
  }
};

