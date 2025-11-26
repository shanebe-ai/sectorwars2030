import { Request, Response } from 'express';
import {
  createPlayer,
  getPlayersByUser,
  getPlayerById,
  hasPlayerInUniverse,
  getPlayerByUserAndUniverse,
} from '../services/playerService';

/**
 * POST /api/players
 * Create a new player in a universe
 */
export const initializePlayer = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { universeId, corpName } = req.body;

    // Validation
    if (!universeId || typeof universeId !== 'number') {
      return res.status(400).json({ error: 'Valid universe ID is required' });
    }

    if (!corpName || typeof corpName !== 'string' || corpName.trim().length === 0) {
      return res.status(400).json({ error: 'Corporation name is required' });
    }

    if (corpName.trim().length < 3 || corpName.trim().length > 100) {
      return res
        .status(400)
        .json({ error: 'Corporation name must be between 3 and 100 characters' });
    }

    // Reserved corporation names (NPC factions)
    const reservedNames = ['terra corp', 'terracorp'];
    if (reservedNames.includes(corpName.trim().toLowerCase())) {
      return res
        .status(400)
        .json({ error: 'This corporation name is reserved' });
    }

    console.log(
      `User ${req.user.username} initializing player in universe ${universeId}`
    );

    const player = await createPlayer({
      userId: req.user.userId,
      universeId,
      corpName: corpName.trim(),
    });

    res.status(201).json({
      message: 'Player created successfully',
      player: {
        id: player.id,
        corpName: player.corp_name,
        universeId: player.universe_id,
        currentSector: player.current_sector,
        credits: player.credits,
        turnsRemaining: player.turns_remaining,
        shipType: player.ship_type,
        shipHoldsMax: player.ship_holds_max,
        shipFighters: player.ship_fighters,
        shipShields: player.ship_shields,
        createdAt: player.created_at,
      },
    });
  } catch (error: any) {
    console.error('Initialize player error:', error);

    if (error.message === 'Universe not found') {
      return res.status(404).json({ error: 'Universe not found' });
    }

    if (error.message === 'Universe is full') {
      return res.status(400).json({ error: 'Universe is full' });
    }

    if (error.message === 'Player already exists in this universe') {
      return res.status(400).json({ error: 'You already have a player in this universe' });
    }

    res.status(500).json({ error: 'Failed to create player' });
  }
};

/**
 * GET /api/players
 * Get all players for the authenticated user
 */
export const getUserPlayers = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const players = await getPlayersByUser(req.user.userId);

    res.json({
      players: players.map((p) => ({
        id: p.id,
        corpName: p.corp_name,
        universeId: p.universe_id,
        universeName: (p as any).universe_name,
        currentSector: p.current_sector,
        credits: p.credits,
        turnsRemaining: p.turns_remaining,
        experience: p.experience,
        alignment: p.alignment,
        shipType: p.ship_type,
        shipHoldsMax: p.ship_holds_max,
        shipFighters: p.ship_fighters,
        shipShields: p.ship_shields,
        isAlive: p.is_alive,
        createdAt: p.created_at,
      })),
      count: players.length,
    });
  } catch (error) {
    console.error('Get user players error:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
};

/**
 * GET /api/players/:id
 * Get specific player details
 */
export const getPlayer = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const playerId = parseInt(req.params.id);

    if (isNaN(playerId)) {
      return res.status(400).json({ error: 'Invalid player ID' });
    }

    const player = await getPlayerById(playerId);

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Verify player belongs to authenticated user
    if (player.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      player: {
        id: player.id,
        corpName: player.corp_name,
        universeId: player.universe_id,
        currentSector: player.current_sector,
        credits: player.credits,
        turnsRemaining: player.turns_remaining,
        experience: player.experience,
        alignment: player.alignment,
        shipType: player.ship_type,
        shipHoldsMax: player.ship_holds_max,
        shipFighters: player.ship_fighters,
        shipShields: player.ship_shields,
        shipTorpedoes: player.ship_torpedoes,
        shipMines: player.ship_mines,
        shipBeacons: player.ship_beacons,
        cargoFuel: player.cargo_fuel,
        cargoOrganics: player.cargo_organics,
        cargoEquipment: player.cargo_equipment,
        isAlive: player.is_alive,
        lastTurnUpdate: player.last_turn_update,
        createdAt: player.created_at,
      },
    });
  } catch (error) {
    console.error('Get player error:', error);
    res.status(500).json({ error: 'Failed to fetch player' });
  }
};

/**
 * GET /api/players/check/:universeId
 * Check if user has a player in a specific universe
 */
export const checkPlayerInUniverse = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const universeId = parseInt(req.params.universeId);

    if (isNaN(universeId)) {
      return res.status(400).json({ error: 'Invalid universe ID' });
    }

    const hasPlayer = await hasPlayerInUniverse(req.user.userId, universeId);

    if (hasPlayer) {
      const player = await getPlayerByUserAndUniverse(req.user.userId, universeId);
      res.json({
        hasPlayer: true,
        player: player
          ? {
              id: player.id,
              corpName: player.corp_name,
              currentSector: player.current_sector,
              credits: player.credits,
              turnsRemaining: player.turns_remaining,
              shipType: player.ship_type,
            }
          : null,
      });
    } else {
      res.json({ hasPlayer: false });
    }
  } catch (error) {
    console.error('Check player in universe error:', error);
    res.status(500).json({ error: 'Failed to check player status' });
  }
};
