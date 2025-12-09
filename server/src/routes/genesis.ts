import express from 'express';
import { authenticateToken } from '../middleware/auth';
import * as genesisService from '../services/genesisService';

const router = express.Router();

/**
 * GET /api/genesis/info
 * Get genesis torpedo information (current count, max capacity, price)
 */
router.get('/info', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;

    // Get player ID from user ID
    const playerResult = await require('../db/connection').query(
      `SELECT id FROM players WHERE user_id = $1`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const info = await genesisService.getGenesisInfo(playerId);
    res.json(info);
  } catch (error: any) {
    console.error('Error getting genesis info:', error);
    res.status(500).json({ error: error.message || 'Failed to get genesis info' });
  }
});

/**
 * POST /api/genesis/purchase
 * Purchase genesis torpedoes at StarDock
 */
router.post('/purchase', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;
    const { quantity } = req.body;

    // Get player ID from user ID
    const playerLookup = await require('../db/connection').query(
      `SELECT id FROM players WHERE user_id = $1`,
      [userId]
    );

    if (playerLookup.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerLookup.rows[0].id;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    const result = await genesisService.purchaseGenesis(playerId, quantity);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({
      message: result.message,
      player: result.player
    });
  } catch (error: any) {
    console.error('Error purchasing genesis torpedoes:', error);
    res.status(500).json({ error: error.message || 'Failed to purchase genesis torpedoes' });
  }
});

/**
 * POST /api/genesis/launch
 * Launch a genesis torpedo to create a new planet
 */
router.post('/launch', authenticateToken, async (req, res) => {
  try {
    const userId = (req as any).user.userId;

    // Get player ID from user ID
    const playerLookup = await require('../db/connection').query(
      `SELECT id FROM players WHERE user_id = $1`,
      [userId]
    );

    if (playerLookup.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerLookup.rows[0].id;

    const result = await genesisService.launchGenesis(playerId);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({
      message: result.message,
      planet: result.planet,
      player: result.player
    });
  } catch (error: any) {
    console.error('Error launching genesis torpedo:', error);
    res.status(500).json({ error: error.message || 'Failed to launch genesis torpedo' });
  }
});

export default router;
