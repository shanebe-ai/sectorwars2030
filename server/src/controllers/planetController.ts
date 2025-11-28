import { Request, Response } from 'express';
import * as planetService from '../services/planetService';
import { pool } from '../db/connection';

// ============================================================================
// GET PLANET INFO
// ============================================================================

export async function getPlanetInfo(req: Request, res: Response) {
  try {
    const planetId = parseInt(req.params.id);
    
    if (isNaN(planetId)) {
      return res.status(400).json({ error: 'Invalid planet ID' });
    }
    
    // First calculate and apply any pending production
    await planetService.calculateAndApplyProduction(planetId);
    
    const planet = await planetService.getPlanetById(planetId);
    
    if (!planet) {
      return res.status(404).json({ error: 'Planet not found' });
    }
    
    // Get citadel info
    const citadelInfo = planetService.CITADEL_LEVELS[planet.citadelLevel];
    const nextCitadel = planet.citadelLevel < 5 ? planetService.CITADEL_LEVELS[planet.citadelLevel + 1] : null;
    
    res.json({
      ...planet,
      citadelInfo,
      nextCitadelUpgrade: nextCitadel
    });
  } catch (error) {
    console.error('Error getting planet info:', error);
    res.status(500).json({ error: 'Failed to get planet info' });
  }
}

// ============================================================================
// GET PLAYER'S PLANETS
// ============================================================================

export async function getPlayerPlanets(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    
    // Get player from token
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const playerId = playerResult.rows[0].id;
    
    // Calculate production for all owned planets
    const planets = await planetService.getPlayerPlanets(playerId);
    
    for (const planet of planets) {
      await planetService.calculateAndApplyProduction(planet.id);
    }
    
    // Get updated planet list
    const updatedPlanets = await planetService.getPlayerPlanets(playerId);
    
    res.json({ planets: updatedPlanets });
  } catch (error) {
    console.error('Error getting player planets:', error);
    res.status(500).json({ error: 'Failed to get player planets' });
  }
}

// ============================================================================
// CLAIM PLANET
// ============================================================================

export async function claimPlanet(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const planetId = parseInt(req.params.id);
    
    if (isNaN(planetId)) {
      return res.status(400).json({ error: 'Invalid planet ID' });
    }
    
    // Get player from token
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const playerId = playerResult.rows[0].id;
    
    const result = await planetService.claimPlanet(planetId, playerId);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    // Add citadel info to the response (same as getPlanetInfo)
    const citadelInfo = planetService.CITADEL_LEVELS[result.planet!.citadelLevel];
    const nextCitadel = result.planet!.citadelLevel < 5 ? planetService.CITADEL_LEVELS[result.planet!.citadelLevel + 1] : null;
    
    res.json({ 
      success: true, 
      message: `Successfully claimed ${result.planet?.name}!`,
      planet: {
        ...result.planet,
        citadelInfo,
        nextCitadelUpgrade: nextCitadel
      }
    });
  } catch (error) {
    console.error('Error claiming planet:', error);
    res.status(500).json({ error: 'Failed to claim planet' });
  }
}

// ============================================================================
// SET PRODUCTION TYPE
// ============================================================================

export async function setProductionType(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const planetId = parseInt(req.params.id);
    const { productionType } = req.body;
    
    if (isNaN(planetId)) {
      return res.status(400).json({ error: 'Invalid planet ID' });
    }
    
    const validTypes = ['fuel', 'organics', 'equipment', 'balanced'];
    if (!validTypes.includes(productionType)) {
      return res.status(400).json({ error: 'Invalid production type' });
    }
    
    // Get player from token
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const playerId = playerResult.rows[0].id;
    
    const result = await planetService.setProductionType(planetId, playerId, productionType);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json({ 
      success: true, 
      message: `Production type set to ${productionType}` 
    });
  } catch (error) {
    console.error('Error setting production type:', error);
    res.status(500).json({ error: 'Failed to set production type' });
  }
}

// ============================================================================
// COLONIST MANAGEMENT
// ============================================================================

export async function depositColonists(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const planetId = parseInt(req.params.id);
    const { amount } = req.body;
    
    if (isNaN(planetId) || isNaN(amount)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    
    // Get player from token
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const playerId = playerResult.rows[0].id;
    
    const result = await planetService.depositColonists(planetId, playerId, amount);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json({ 
      success: true, 
      message: `Deposited ${result.colonistsDeposited?.toLocaleString()} colonists`,
      colonistsDeposited: result.colonistsDeposited
    });
  } catch (error) {
    console.error('Error depositing colonists:', error);
    res.status(500).json({ error: 'Failed to deposit colonists' });
  }
}

// ============================================================================
// RESOURCE MANAGEMENT
// ============================================================================

export async function withdrawResources(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const planetId = parseInt(req.params.id);
    const { resource, amount } = req.body;
    
    if (isNaN(planetId) || isNaN(amount)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    
    const validResources = ['fuel', 'organics', 'equipment'];
    if (!validResources.includes(resource)) {
      return res.status(400).json({ error: 'Invalid resource type' });
    }
    
    // Get player from token
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const playerId = playerResult.rows[0].id;
    
    const result = await planetService.withdrawResources(planetId, playerId, resource, amount);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json({ 
      success: true, 
      message: `Withdrew ${result.amountWithdrawn?.toLocaleString()} ${resource}`,
      amountWithdrawn: result.amountWithdrawn,
      resource
    });
  } catch (error) {
    console.error('Error withdrawing resources:', error);
    res.status(500).json({ error: 'Failed to withdraw resources' });
  }
}

export async function depositResources(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const planetId = parseInt(req.params.id);
    const { resource, amount } = req.body;
    
    if (isNaN(planetId) || isNaN(amount)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    
    const validResources = ['fuel', 'organics', 'equipment'];
    if (!validResources.includes(resource)) {
      return res.status(400).json({ error: 'Invalid resource type' });
    }
    
    // Get player from token
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const playerId = playerResult.rows[0].id;
    
    const result = await planetService.depositResources(planetId, playerId, resource, amount);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json({ 
      success: true, 
      message: `Deposited ${result.amountDeposited?.toLocaleString()} ${resource}`,
      amountDeposited: result.amountDeposited,
      resource
    });
  } catch (error) {
    console.error('Error depositing resources:', error);
    res.status(500).json({ error: 'Failed to deposit resources' });
  }
}

// ============================================================================
// FIGHTER MANAGEMENT
// ============================================================================

export async function depositFighters(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const planetId = parseInt(req.params.id);
    const { amount } = req.body;
    
    if (isNaN(planetId) || isNaN(amount)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    
    // Get player from token
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const playerId = playerResult.rows[0].id;
    
    const result = await planetService.depositFighters(planetId, playerId, amount);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json({ 
      success: true, 
      message: `Deployed ${result.fightersDeposited?.toLocaleString()} fighters`,
      fightersDeposited: result.fightersDeposited
    });
  } catch (error) {
    console.error('Error deploying fighters:', error);
    res.status(500).json({ error: 'Failed to deploy fighters' });
  }
}

export async function withdrawFighters(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const planetId = parseInt(req.params.id);
    const { amount } = req.body;
    
    if (isNaN(planetId) || isNaN(amount)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    
    // Get player from token
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const playerId = playerResult.rows[0].id;
    
    const result = await planetService.withdrawFighters(planetId, playerId, amount);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json({ 
      success: true, 
      message: `Retrieved ${result.fightersWithdrawn?.toLocaleString()} fighters`,
      fightersWithdrawn: result.fightersWithdrawn
    });
  } catch (error) {
    console.error('Error retrieving fighters:', error);
    res.status(500).json({ error: 'Failed to retrieve fighters' });
  }
}

// ============================================================================
// CITADEL UPGRADE
// ============================================================================

export async function upgradeCitadel(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const planetId = parseInt(req.params.id);
    
    if (isNaN(planetId)) {
      return res.status(400).json({ error: 'Invalid planet ID' });
    }
    
    // Get player from token
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const playerId = playerResult.rows[0].id;
    
    const result = await planetService.upgradeCitadel(planetId, playerId);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    const citadelInfo = planetService.CITADEL_LEVELS[result.newLevel!];
    
    res.json({ 
      success: true, 
      message: `Citadel upgraded to Level ${result.newLevel} - ${citadelInfo.name}`,
      newLevel: result.newLevel,
      cost: result.cost,
      citadelInfo
    });
  } catch (error) {
    console.error('Error upgrading citadel:', error);
    res.status(500).json({ error: 'Failed to upgrade citadel' });
  }
}

// ============================================================================
// CREDITS MANAGEMENT
// ============================================================================

export async function depositCredits(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const planetId = parseInt(req.params.id);
    const { amount } = req.body;
    
    if (isNaN(planetId) || isNaN(amount)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    
    // Get player from token
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const playerId = playerResult.rows[0].id;
    
    const result = await planetService.depositCredits(planetId, playerId, amount);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json({ 
      success: true, 
      message: `Deposited ₡${result.creditsDeposited?.toLocaleString()}`,
      creditsDeposited: result.creditsDeposited
    });
  } catch (error) {
    console.error('Error depositing credits:', error);
    res.status(500).json({ error: 'Failed to deposit credits' });
  }
}

export async function withdrawCredits(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.userId;
    const planetId = parseInt(req.params.id);
    const { amount } = req.body;
    
    if (isNaN(planetId) || isNaN(amount)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    
    // Get player from token
    const playerResult = await pool.query(
      'SELECT id FROM players WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    
    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const playerId = playerResult.rows[0].id;
    
    const result = await planetService.withdrawCredits(planetId, playerId, amount);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json({ 
      success: true, 
      message: `Withdrew ₡${result.creditsWithdrawn?.toLocaleString()}`,
      creditsWithdrawn: result.creditsWithdrawn
    });
  } catch (error) {
    console.error('Error withdrawing credits:', error);
    res.status(500).json({ error: 'Failed to withdraw credits' });
  }
}

