import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { pool } from '../db/connection';
import {
  purchaseBeacons,
  launchBeacon,
  getSectorBeacons,
  getPlayerBeacons,
  attackBeacon,
  retrieveBeacon,
  getBeaconCapacity,
  BEACON_PRICE
} from '../services/beaconService';

const router = Router();

// All beacon routes require authentication
router.use(authenticateToken);

/**
 * Get beacon info (price, capacity, current count)
 * GET /api/beacons/info
 */
router.get('/info', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    const playerResult = await pool.query(
      `SELECT ship_type, ship_beacons FROM players WHERE user_id = $1`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const player = playerResult.rows[0];
    const capacity = getBeaconCapacity(player.ship_type);

    res.json({
      price: BEACON_PRICE,
      currentCount: player.ship_beacons || 0,
      maxCapacity: capacity,
      shipType: player.ship_type
    });
  } catch (error) {
    console.error('Error getting beacon info:', error);
    res.status(500).json({ error: 'Failed to get beacon info' });
  }
});

/**
 * Purchase beacons at StarDock
 * POST /api/beacons/purchase
 */
router.post('/purchase', async (req: Request, res: Response) => {
  try {
    const { quantity } = req.body;
    const userId = (req as any).user?.userId;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    const playerResult = await pool.query(
      `SELECT id FROM players WHERE user_id = $1`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const result = await purchaseBeacons(playerId, quantity);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Get updated player data
    const updatedPlayer = await pool.query(
      `SELECT credits, ship_beacons FROM players WHERE id = $1`,
      [playerId]
    );

    res.json({
      success: true,
      message: result.message,
      player: {
        credits: parseInt(updatedPlayer.rows[0].credits),
        beacons: updatedPlayer.rows[0].ship_beacons
      }
    });
  } catch (error) {
    console.error('Error purchasing beacons:', error);
    res.status(500).json({ error: 'Failed to purchase beacons' });
  }
});

/**
 * Launch a beacon in current sector
 * POST /api/beacons/launch
 */
router.post('/launch', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    const userId = (req as any).user?.userId;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const playerResult = await pool.query(
      `SELECT id FROM players WHERE user_id = $1`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const result = await launchBeacon(playerId, message);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Get updated beacon count
    const updatedPlayer = await pool.query(
      `SELECT ship_beacons FROM players WHERE id = $1`,
      [playerId]
    );

    res.json({
      success: true,
      message: result.message,
      beaconsRemaining: updatedPlayer.rows[0].ship_beacons
    });
  } catch (error) {
    console.error('Error launching beacon:', error);
    res.status(500).json({ error: 'Failed to launch beacon' });
  }
});

/**
 * Get beacons in current sector
 * GET /api/beacons/sector
 */
router.get('/sector', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    const playerResult = await pool.query(
      `SELECT universe_id, current_sector FROM players WHERE user_id = $1`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const { universe_id, current_sector } = playerResult.rows[0];
    const beacons = await getSectorBeacons(universe_id, current_sector);

    res.json({
      beacons: beacons.map(b => ({
        id: b.id,
        ownerId: b.owner_id,
        ownerName: b.owner_name,
        message: b.message,
        createdAt: b.created_at
      }))
    });
  } catch (error) {
    console.error('Error getting sector beacons:', error);
    res.status(500).json({ error: 'Failed to get beacons' });
  }
});

/**
 * Get all beacons owned by player
 * GET /api/beacons/mine
 */
router.get('/mine', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    const playerResult = await pool.query(
      `SELECT id FROM players WHERE user_id = $1`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const beacons = await getPlayerBeacons(playerId);

    res.json({
      beacons: beacons.map(b => ({
        id: b.id,
        sectorNumber: b.sector_number,
        message: b.message,
        createdAt: b.created_at
      }))
    });
  } catch (error) {
    console.error('Error getting player beacons:', error);
    res.status(500).json({ error: 'Failed to get beacons' });
  }
});

/**
 * Attack a beacon
 * POST /api/beacons/attack
 */
router.post('/attack', async (req: Request, res: Response) => {
  const { beaconId } = req.body;
  const userId = (req as any).user?.userId;

  try {

    if (!beaconId) {
      return res.status(400).json({ error: 'Beacon ID is required' });
    }

    const playerResult = await pool.query(
      `SELECT id FROM players WHERE user_id = $1`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const result = await attackBeacon(playerId, beaconId);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Get updated fighter count
    let fightersRemaining = 0;
    try {
      const updatedPlayer = await pool.query(
        `SELECT ship_fighters FROM players WHERE id = $1`,
        [playerId]
      );
      fightersRemaining = updatedPlayer.rows[0]?.ship_fighters || 0;
    } catch (fighterError: any) {
      console.error('Error getting updated fighter count:', fighterError);
      // Continue even if fighter count fetch fails
    }

    res.json({
      success: true,
      message: result.message,
      fightersLost: result.fightersLost,
      fightersRemaining
    });
  } catch (error: any) {
    console.error('Error attacking beacon:', error);
    console.error('Error details:', {
      userId,
      beaconId: req.body.beaconId,
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to attack beacon',
      details: error.message || 'Unknown error'
    });
  }
});

/**
 * Retrieve your own beacon
 * POST /api/beacons/retrieve
 */
router.post('/retrieve', async (req: Request, res: Response) => {
  try {
    const { beaconId } = req.body;
    const userId = (req as any).user?.userId;

    if (!beaconId) {
      return res.status(400).json({ error: 'Beacon ID is required' });
    }

    const playerResult = await pool.query(
      `SELECT id FROM players WHERE user_id = $1`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const result = await retrieveBeacon(playerId, beaconId);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Get updated beacon count
    const updatedPlayer = await pool.query(
      `SELECT ship_beacons FROM players WHERE id = $1`,
      [playerId]
    );

    res.json({
      success: true,
      message: result.message,
      beaconsOnShip: updatedPlayer.rows[0].ship_beacons
    });
  } catch (error) {
    console.error('Error retrieving beacon:', error);
    res.status(500).json({ error: 'Failed to retrieve beacon' });
  }
});

export default router;

