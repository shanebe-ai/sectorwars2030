import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { pool } from '../db/connection';
import { getFloatingCargo, pickupCargo, jettisonCargo } from '../services/cargoService';

const router = Router();

// All cargo routes require authentication
router.use(authenticateToken);

/**
 * Get floating cargo in current sector
 * GET /api/cargo
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get player's location
    const playerResult = await pool.query(
      'SELECT universe_id, current_sector FROM players WHERE user_id = $1',
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const { universe_id, current_sector } = playerResult.rows[0];
    const cargo = await getFloatingCargo(universe_id, current_sector);

    res.json({
      cargo: cargo.map(c => ({
        id: c.id,
        fuel: c.fuel,
        organics: c.organics,
        equipment: c.equipment,
        colonists: c.colonists,
        source: c.source_event,
        createdAt: c.created_at,
        expiresAt: c.expires_at
      }))
    });
  } catch (error) {
    console.error('Error getting floating cargo:', error);
    res.status(500).json({ error: 'Failed to get cargo' });
  }
});

/**
 * Pick up floating cargo
 * POST /api/cargo/pickup
 */
router.post('/pickup', async (req: Request, res: Response) => {
  try {
    const { cargoId } = req.body;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!cargoId || typeof cargoId !== 'number') {
      return res.status(400).json({ error: 'Invalid cargo ID' });
    }

    // Get player ID
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1',
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const result = await pickupCargo(playerId, cargoId);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Get updated player data
    const updatedPlayerResult = await pool.query(
      `SELECT id, cargo_fuel, cargo_organics, cargo_equipment, colonists, ship_holds_max
       FROM players WHERE id = $1`,
      [playerId]
    );

    res.json({
      success: true,
      pickedUp: {
        fuel: result.fuelPickedUp,
        organics: result.organicsPickedUp,
        equipment: result.equipmentPickedUp,
        colonists: result.colonistsPickedUp
      },
      remainingInSpace: result.remainingInSpace,
      message: result.message,
      player: {
        cargoFuel: updatedPlayerResult.rows[0].cargo_fuel,
        cargoOrganics: updatedPlayerResult.rows[0].cargo_organics,
        cargoEquipment: updatedPlayerResult.rows[0].cargo_equipment,
        colonists: updatedPlayerResult.rows[0].colonists,
        shipHoldsMax: updatedPlayerResult.rows[0].ship_holds_max
      }
    });
  } catch (error) {
    console.error('Error picking up cargo:', error);
    res.status(500).json({ error: 'Failed to pick up cargo' });
  }
});

/**
 * Jettison cargo into space
 * POST /api/cargo/jettison
 */
router.post('/jettison', async (req: Request, res: Response) => {
  try {
    const { fuel = 0, organics = 0, equipment = 0 } = req.body;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get player ID
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1',
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const result = await jettisonCargo(playerId, fuel, organics, equipment);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Get updated player data
    const updatedPlayerResult = await pool.query(
      `SELECT cargo_fuel, cargo_organics, cargo_equipment FROM players WHERE id = $1`,
      [playerId]
    );

    res.json({
      success: true,
      message: result.message,
      player: {
        cargoFuel: updatedPlayerResult.rows[0].cargo_fuel,
        cargoOrganics: updatedPlayerResult.rows[0].cargo_organics,
        cargoEquipment: updatedPlayerResult.rows[0].cargo_equipment
      }
    });
  } catch (error) {
    console.error('Error jettisoning cargo:', error);
    res.status(500).json({ error: 'Failed to jettison cargo' });
  }
});

export default router;

