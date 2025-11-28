import { Request, Response } from 'express';
import { getPortInfo, executeTrade, buyColonists, getColonistInfo } from '../services/portService';

/**
 * GET /api/ports/:sectorNumber
 * Get port information for a specific sector
 */
export const getPort = async (req: Request, res: Response) => {
  try {
    const { sectorNumber } = req.params;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sectorNum = parseInt(sectorNumber);
    if (isNaN(sectorNum)) {
      return res.status(400).json({ error: 'Invalid sector number' });
    }

    const portInfo = await getPortInfo(userId, sectorNum);

    if (!portInfo) {
      return res.status(404).json({ error: 'No port in this sector' });
    }

    res.json({ port: portInfo });
  } catch (error: any) {
    console.error('Error getting port info:', error);
    res.status(500).json({ error: error.message || 'Failed to get port information' });
  }
};

/**
 * POST /api/ports/trade
 * Execute a trade at the current sector's port
 */
export const trade = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { commodity, action, quantity } = req.body;

    // Validate commodity
    if (!['fuel', 'organics', 'equipment'].includes(commodity)) {
      return res.status(400).json({ error: 'Invalid commodity. Must be fuel, organics, or equipment' });
    }

    // Validate action
    if (!['buy', 'sell'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be buy or sell' });
    }

    // Validate quantity
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Invalid quantity. Must be a positive number' });
    }

    const result = await executeTrade(userId, commodity, action, qty);

    res.json(result);
  } catch (error: any) {
    console.error('Error executing trade:', error);
    
    // Return specific error messages for known error types
    if (error.message.includes('Not enough turns')) {
      return res.status(400).json({ error: 'Not enough turns remaining' });
    }
    if (error.message.includes('No port')) {
      return res.status(400).json({ error: 'No port in this sector' });
    }
    if (error.message.includes('does not')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message.includes('Cannot complete trade')) {
      return res.status(400).json({ error: error.message });
    }
    if (error.message.includes('do not have')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: error.message || 'Failed to execute trade' });
  }
};

/**
 * GET /api/ports/colonists
 * Get colonist purchase information for the current port
 */
export const getColonists = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const colonistInfo = await getColonistInfo(userId);
    res.json(colonistInfo);
  } catch (error: any) {
    console.error('Error getting colonist info:', error);
    res.status(500).json({ error: error.message || 'Failed to get colonist information' });
  }
};

/**
 * POST /api/ports/colonists/buy
 * Purchase colonists at the current port
 */
export const purchaseColonists = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { quantity } = req.body;
    const qty = parseInt(quantity);

    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Invalid quantity. Must be a positive number' });
    }

    const result = await buyColonists(userId, qty);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      message: `Purchased ${result.quantity.toLocaleString()} colonists for ₡${result.totalCost.toLocaleString()}`,
      quantity: result.quantity,
      totalCost: result.totalCost,
      player: result.player
    });
  } catch (error: any) {
    console.error('Error purchasing colonists:', error);
    res.status(500).json({ error: error.message || 'Failed to purchase colonists' });
  }
};

