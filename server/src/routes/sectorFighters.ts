import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { pool } from '../db/connection';
import {
  getSectorFighters,
  deployFighters,
  retrieveFighters,
  getHostileFighters,
  attackSectorFighters,
  retreatFromSector,
  getPlayerTotalDeployed
} from '../services/sectorFighterService';

const router = Router();

router.use(authenticateToken);

/**
 * Get fighters in current sector
 * GET /api/sector-fighters
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    const playerResult = await pool.query(
      `SELECT id, universe_id, current_sector FROM players WHERE user_id = $1`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const { id, universe_id, current_sector } = playerResult.rows[0];
    const fighters = await getSectorFighters(universe_id, current_sector);
    const hostile = await getHostileFighters(id, universe_id, current_sector);

    res.json({
      fighters: fighters.map(f => ({
        ...f,
        isOwn: f.ownerId === id
      })),
      hasHostile: hostile.length > 0,
      hostileFighters: hostile
    });
  } catch (error) {
    console.error('Error getting sector fighters:', error);
    res.status(500).json({ error: 'Failed to get sector fighters' });
  }
});

/**
 * Get player's deployed fighters stats
 * GET /api/sector-fighters/my-deployments
 */
router.get('/my-deployments', async (req: Request, res: Response) => {
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
    
    const deploymentsResult = await pool.query(
      `SELECT sector_number, fighter_count, deployed_at
       FROM sector_fighters WHERE owner_id = $1 AND fighter_count > 0
       ORDER BY deployed_at DESC`,
      [playerId]
    );

    const totalDeployed = await getPlayerTotalDeployed(playerId);

    res.json({
      deployments: deploymentsResult.rows.map(d => ({
        sectorNumber: d.sector_number,
        fighterCount: d.fighter_count,
        deployedAt: d.deployed_at
      })),
      totalDeployed
    });
  } catch (error) {
    console.error('Error getting deployments:', error);
    res.status(500).json({ error: 'Failed to get deployments' });
  }
});

/**
 * Deploy fighters to current sector
 * POST /api/sector-fighters/deploy
 */
router.post('/deploy', async (req: Request, res: Response) => {
  try {
    const { count } = req.body;
    const userId = (req as any).user?.userId;

    if (!count || count < 1) {
      return res.status(400).json({ error: 'Invalid count' });
    }

    const playerResult = await pool.query(
      `SELECT id FROM players WHERE user_id = $1`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const result = await deployFighters(playerId, count);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({
      success: true,
      message: result.message,
      shipFighters: result.newShipFighters,
      deployedInSector: result.deployedInSector
    });
  } catch (error) {
    console.error('Error deploying fighters:', error);
    res.status(500).json({ error: 'Failed to deploy fighters' });
  }
});

/**
 * Retrieve fighters from current sector
 * POST /api/sector-fighters/retrieve
 */
router.post('/retrieve', async (req: Request, res: Response) => {
  try {
    const { count } = req.body;
    const userId = (req as any).user?.userId;

    if (!count || count < 1) {
      return res.status(400).json({ error: 'Invalid count' });
    }

    const playerResult = await pool.query(
      `SELECT id FROM players WHERE user_id = $1`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const result = await retrieveFighters(playerId, count);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    res.json({
      success: true,
      message: result.message,
      shipFighters: result.newShipFighters,
      remainingInSector: result.remainingInSector
    });
  } catch (error) {
    console.error('Error retrieving fighters:', error);
    res.status(500).json({ error: 'Failed to retrieve fighters' });
  }
});

/**
 * Attack stationed fighters
 * POST /api/sector-fighters/attack
 */
router.post('/attack', async (req: Request, res: Response) => {
  try {
    const { deploymentId } = req.body;
    const userId = (req as any).user?.userId;

    if (!deploymentId) {
      return res.status(400).json({ error: 'Deployment ID required' });
    }

    const playerResult = await pool.query(
      `SELECT id FROM players WHERE user_id = $1`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const result = await attackSectorFighters(playerId, deploymentId);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Get updated player data
    const updatedPlayer = await pool.query(
      `SELECT ship_fighters, ship_shields FROM players WHERE id = $1`,
      [playerId]
    );

    res.json({
      success: true,
      message: result.message,
      attackerWon: result.attackerWon,
      attackerFightersLost: result.attackerFightersLost,
      defenderFightersLost: result.defenderFightersLost,
      attackerShieldsLost: result.attackerShieldsLost,
      player: {
        shipFighters: updatedPlayer.rows[0].ship_fighters,
        shipShields: updatedPlayer.rows[0].ship_shields
      }
    });
  } catch (error) {
    console.error('Error attacking fighters:', error);
    res.status(500).json({ error: 'Failed to attack fighters' });
  }
});

/**
 * Retreat from sector with hostile fighters
 * POST /api/sector-fighters/retreat
 */
router.post('/retreat', async (req: Request, res: Response) => {
  try {
    const { destinationSector } = req.body;
    const userId = (req as any).user?.userId;

    if (!destinationSector) {
      return res.status(400).json({ error: 'Destination sector required' });
    }

    const playerResult = await pool.query(
      `SELECT id FROM players WHERE user_id = $1`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const result = await retreatFromSector(playerId, destinationSector);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    // Get updated player data
    const updatedPlayer = await pool.query(
      `SELECT current_sector, ship_fighters, ship_shields, turns_remaining FROM players WHERE id = $1`,
      [playerId]
    );

    res.json({
      success: true,
      message: result.message,
      shieldsLost: result.shieldsLost,
      fightersLost: result.fightersLost,
      player: {
        currentSector: updatedPlayer.rows[0].current_sector,
        shipFighters: updatedPlayer.rows[0].ship_fighters,
        shipShields: updatedPlayer.rows[0].ship_shields,
        turnsRemaining: updatedPlayer.rows[0].turns_remaining
      }
    });
  } catch (error) {
    console.error('Error retreating:', error);
    res.status(500).json({ error: 'Failed to retreat' });
  }
});

export default router;

