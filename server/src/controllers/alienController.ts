/**
 * Alien Controller
 * Handles alien communications and alien encounter endpoints
 */

import { Request, Response } from 'express';
import { pool } from '../db/connection';
import {
  getAlienShipsInSector,
  getAlienPlanetInSector,
  getAlienCommunications,
  hasAlienComms,
  unlockAlienComms,
  attackAlienShip,
  attackAlienPlanet
} from '../services/alienService';

/**
 * GET /api/aliens/comms
 * Get alien communications (if player has unlocked it)
 */
export async function getAlienComms(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get player's id and universe
    const playerResult = await pool.query(`
      SELECT id, universe_id FROM players WHERE user_id = $1
    `, [userId]);

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const playerId = playerResult.rows[0].id;
    const universeId = playerResult.rows[0].universe_id;

    // Get alien communications
    const communications = await getAlienCommunications(playerId, universeId, 100);

    // Check if player has comms unlocked
    const unlocked = await hasAlienComms(playerId);

    res.json({
      unlocked,
      communications: communications.map(comm => ({
        id: comm.id,
        alienRace: comm.alien_race,
        messageType: comm.message_type,
        message: comm.message,
        sectorNumber: comm.sector_number,
        playerUsername: comm.player_username,
        playerCorp: comm.player_corp,
        createdAt: comm.created_at
      }))
    });
  } catch (error) {
    console.error('Error getting alien communications:', error);
    res.status(500).json({ error: 'Failed to get alien communications' });
  }
}

/**
 * GET /api/aliens/sector/:sectorNumber
 * Get alien presence in a sector (ships and planets)
 */
export async function getAlienPresence(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const sectorNumber = parseInt(req.params.sectorNumber);

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (isNaN(sectorNumber)) {
      res.status(400).json({ error: 'Invalid sector number' });
      return;
    }

    // Get player's universe
    const playerResult = await pool.query(`
      SELECT universe_id FROM players WHERE user_id = $1
    `, [userId]);

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const universeId = playerResult.rows[0].universe_id;

    // Get alien ships and planet in sector
    const alienShips = await getAlienShipsInSector(universeId, sectorNumber);
    const alienPlanet = await getAlienPlanetInSector(universeId, sectorNumber);

    res.json({
      ships: alienShips,
      planet: alienPlanet
    });
  } catch (error) {
    console.error('Error getting alien presence:', error);
    res.status(500).json({ error: 'Failed to get alien presence' });
  }
}

/**
 * POST /api/aliens/unlock
 * Manually unlock alien comms (called when player enters alien planet sector)
 */
export async function unlockComms(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get player's id and universe
    const playerResult = await pool.query(`
      SELECT id, universe_id FROM players WHERE user_id = $1
    `, [userId]);

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const playerId = playerResult.rows[0].id;
    const universeId = playerResult.rows[0].universe_id;

    // Unlock alien comms
    await unlockAlienComms(playerId, universeId);

    res.json({
      success: true,
      message: 'Alien communications channel unlocked!'
    });
  } catch (error) {
    console.error('Error unlocking alien comms:', error);
    res.status(500).json({ error: 'Failed to unlock alien comms' });
  }
}

/**
 * POST /api/aliens/attack
 * Attack an alien ship
 */
export async function attackAlien(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const { alienShipId } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!alienShipId || typeof alienShipId !== 'number') {
      res.status(400).json({ error: 'Valid alien ship ID is required' });
      return;
    }

    // Get player's id
    const playerResult = await pool.query(`
      SELECT id FROM players WHERE user_id = $1
    `, [userId]);

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const playerId = playerResult.rows[0].id;

    // Execute attack
    const result = await attackAlienShip(playerId, alienShipId);

    res.json({
      success: result.success,
      message: result.message,
      combat: {
        winner: result.winner,
        rounds: result.rounds,
        playerFightersLost: result.playerFightersLost,
        alienFightersLost: result.alienFightersLost,
        playerShieldsLost: result.playerShieldsLost,
        alienShieldsLost: result.alienShieldsLost,
        alienDestroyed: result.alienDestroyed,
        playerDestroyed: result.playerDestroyed,
        creditsLooted: result.creditsLooted,
        playerEscapeSector: result.playerEscapeSector
      },
      combatLog: result.combatLog
    });
  } catch (error: any) {
    console.error('Error attacking alien ship:', error);
    res.status(400).json({ error: error.message || 'Failed to attack alien ship' });
  }
}

/**
 * POST /api/aliens/attack-planet
 * Attack an alien planet
 */
export async function attackPlanet(req: Request, res: Response): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const { planetId } = req.body;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!planetId || typeof planetId !== 'number') {
      res.status(400).json({ error: 'Valid planet ID is required' });
      return;
    }

    // Get player's id
    const playerResult = await pool.query(`
      SELECT id FROM players WHERE user_id = $1
    `, [userId]);

    if (playerResult.rows.length === 0) {
      res.status(404).json({ error: 'Player not found' });
      return;
    }

    const playerId = playerResult.rows[0].id;

    // Execute attack
    const result = await attackAlienPlanet(playerId, planetId);

    res.json({
      success: result.success,
      message: result.message,
      combat: {
        winner: result.winner,
        rounds: result.rounds,
        playerFightersLost: result.playerFightersLost,
        alienFightersLost: result.alienFightersLost,
        playerShieldsLost: result.playerShieldsLost,
        alienShieldsLost: result.alienShieldsLost,
        alienDestroyed: result.alienDestroyed,
        playerDestroyed: result.playerDestroyed,
        creditsLooted: result.creditsLooted,
        playerEscapeSector: result.playerEscapeSector
      },
      combatLog: result.combatLog
    });
  } catch (error: any) {
    console.error('Error attacking alien planet:', error);
    res.status(400).json({ error: error.message || 'Failed to attack alien planet' });
  }
}
