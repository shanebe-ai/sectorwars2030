import { Request, Response } from 'express';
import {
  createPlayer,
  getPlayersByUser,
  getPlayerById,
  hasPlayerInUniverse,
  getPlayerByUserAndUniverse,
  regenerateTurns,
  getPlayerByIdWithTurns,
} from '../services/playerService';
import { query } from '../db/connection';

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
        cargoFuel: p.cargo_fuel,
        cargoOrganics: p.cargo_organics,
        cargoEquipment: p.cargo_equipment,
        colonists: p.colonists || 0,
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
 * Get specific player details (with turn regeneration)
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

    // First check ownership without regenerating turns
    const playerCheck = await getPlayerById(playerId);

    if (!playerCheck) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Verify player belongs to authenticated user
    if (playerCheck.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Now regenerate turns and get updated player
    const player = await getPlayerByIdWithTurns(playerId);

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Check for unseen combat deaths (escape pod events)
    let notification = null;
    const combatResult = await query(
      `SELECT cl.*,
        u_attacker.username as attacker_name,
        c_attacker.name as attacker_corp
       FROM combat_log cl
       LEFT JOIN players p_attacker ON cl.attacker_id = p_attacker.id
       LEFT JOIN users u_attacker ON p_attacker.user_id = u_attacker.id
       LEFT JOIN corporations c_attacker ON p_attacker.corp_id = c_attacker.id
       WHERE cl.defender_id = $1
         AND cl.defender_destroyed = TRUE
         AND cl.notification_seen = FALSE
       ORDER BY cl.created_at DESC
       LIMIT 1`,
      [playerId]
    );

    if (combatResult.rows.length > 0) {
      const combat = combatResult.rows[0];
      const attackerName = combat.attacker_name || 'Unknown';
      const attackerCorp = combat.attacker_corp || 'Independent';
      const creditsLost = combat.credits_looted || 0;
      const cargoData = combat.cargo_looted || {};
      const cargoLost = (cargoData.fuel || 0) + (cargoData.organics || 0) + (cargoData.equipment || 0);

      notification = {
        type: 'escape_pod',
        title: '⚠️ SHIP DESTROYED',
        message: `Your ship was destroyed by ${attackerName} (${attackerCorp}) in Sector ${combat.sector_number}! You escaped in an escape pod. Lost: ₡${creditsLost.toLocaleString()} credits and ${cargoLost} cargo units.`,
        timestamp: combat.created_at,
        combatLogId: combat.id
      };

      // Mark this combat event as seen
      await query(
        `UPDATE combat_log SET notification_seen = TRUE WHERE id = $1`,
        [combat.id]
      );
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
        colonists: player.colonists || 0,
        isAlive: player.is_alive,
        lastTurnUpdate: player.last_turn_update,
        createdAt: player.created_at,
      },
      notification,
    });
  } catch (error) {
    console.error('Get player error:', error);
    res.status(500).json({ error: 'Failed to fetch player' });
  }
};

/**
 * GET /api/players/check/:universeId
 * Check if user has a player in a specific universe (with turn regeneration)
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
      const playerBase = await getPlayerByUserAndUniverse(req.user.userId, universeId);
      
      // Regenerate turns if player exists
      let player = playerBase;
      if (playerBase) {
        player = await regenerateTurns(playerBase.id) || playerBase;
      }

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
              shipHoldsMax: player.ship_holds_max,
              cargoFuel: player.cargo_fuel,
              cargoOrganics: player.cargo_organics,
              cargoEquipment: player.cargo_equipment,
              colonists: player.colonists || 0,
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
