import express from 'express';
import { authenticateToken } from '../middleware/auth';
import * as mineService from '../services/mineService';

const router = express.Router();

/**
 * GET /api/mines/info
 * Get mine information (current count, max capacity, price)
 */
router.get('/info', authenticateToken, async (req, res) => {
  try {
    const playerId = (req as any).user.id;
    const info = await mineService.getMineInfo(playerId);
    res.json(info);
  } catch (error: any) {
    console.error('Error getting mine info:', error);
    res.status(500).json({ error: error.message || 'Failed to get mine info' });
  }
});

/**
 * POST /api/mines/purchase
 * Purchase mines at StarDock
 */
router.post('/purchase', authenticateToken, async (req, res) => {
  try {
    const playerId = (req as any).user.id;
    const { quantity } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    const client = await require('../db/connection').getClient();
    
    try {
      await client.query('BEGIN');

      // Get player and ship type info
      const playerResult = await client.query(
        `SELECT p.id, p.credits, p.ship_mines, p.ship_type, p.universe_id, st.mines_max
         FROM players p
         JOIN ship_types st ON LOWER(st.name) = LOWER(p.ship_type) AND (st.universe_id = p.universe_id OR st.universe_id IS NULL)
         WHERE p.id = $1 FOR UPDATE`,
        [playerId]
      );

      if (playerResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Player not found' });
      }

      const player = playerResult.rows[0];
      const maxCapacity = player.mines_max || 0;
      const currentCount = player.ship_mines || 0;
      const spaceAvailable = maxCapacity - currentCount;

      if (spaceAvailable <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Your ship cannot carry any more mines' });
      }

      if (quantity > spaceAvailable) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Your ship can only hold ${spaceAvailable} more mines` });
      }

      const price = 50000; // Base price per mine
      const totalCost = price * quantity;

      if (player.credits < totalCost) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Insufficient credits. Need ₡${totalCost.toLocaleString()}` });
      }

      // Deduct credits and add mines
      await client.query(
        `UPDATE players SET credits = credits - $1, ship_mines = ship_mines + $2 WHERE id = $3`,
        [totalCost, quantity, playerId]
      );

      // Get updated player
      const updatedResult = await client.query(
        `SELECT * FROM players WHERE id = $1`,
        [playerId]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Purchased ${quantity} mines for ₡${totalCost.toLocaleString()}`,
        player: updatedResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error purchasing mines:', error);
    res.status(500).json({ error: error.message || 'Failed to purchase mines' });
  }
});

/**
 * POST /api/mines/deploy
 * Deploy mines to current sector
 */
router.post('/deploy', authenticateToken, async (req, res) => {
  try {
    const playerId = (req as any).user.id;
    const { count } = req.body;

    if (!count || count <= 0) {
      return res.status(400).json({ error: 'Invalid count' });
    }

    const result = await mineService.deployMines(playerId, count);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Get updated player
    const playerResponse = await require('../db/connection').query(
      `SELECT * FROM players WHERE id = $1`,
      [playerId]
    );

    res.json({
      ...result,
      player: playerResponse.rows[0]
    });
  } catch (error: any) {
    console.error('Error deploying mines:', error);
    res.status(500).json({ error: error.message || 'Failed to deploy mines' });
  }
});

export default router;

