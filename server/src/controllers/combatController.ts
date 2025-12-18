import { Request, Response } from 'express';
import {
  canAttack,
  executeAttack,
  getCombatHistory,
  getAttackableTargets
} from '../services/combatService';
import { pool } from '../db/connection';
import { notifyCombatResult } from '../services/broadcastService';

/**
 * Attack another player in the same sector
 * POST /api/combat/attack
 */
export const attackPlayer = async (req: Request, res: Response) => {
  try {
    const { targetId } = req.body;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!targetId || typeof targetId !== 'number') {
      return res.status(400).json({ error: 'Invalid target ID' });
    }

    // Get attacker's player ID
    const playerResult = await pool.query(
      'SELECT id, universe_id FROM players WHERE user_id = $1',
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const attackerId = playerResult.rows[0].id;

    // Check if attack is valid
    const attackCheck = await canAttack(attackerId, targetId);
    console.log(`[COMBAT] Attack validation - Attacker: ${attackerId}, Target: ${targetId}, Can Attack: ${attackCheck.canAttack}, Reason: ${attackCheck.reason}`);
    if (!attackCheck.canAttack) {
      console.log(`[COMBAT] Attack REJECTED: ${attackCheck.reason}`);
      return res.status(400).json({ error: attackCheck.reason });
    }

    // Execute the attack
    const result = await executeAttack(attackerId, targetId);

    // Get updated player stats
    const updatedPlayerResult = await pool.query(
      `SELECT 
        id, corp_name, current_sector, credits, turns_remaining,
        ship_type, ship_holds_max, ship_fighters, ship_shields,
        cargo_fuel, cargo_organics, cargo_equipment, 
        kills, deaths, alignment, in_escape_pod
       FROM players WHERE id = $1`,
      [attackerId]
    );

    const updatedPlayer = updatedPlayerResult.rows[0];

    // Send WebSocket notification for combat result
    try {
      await notifyCombatResult(
        playerResult.rows[0].universe_id,
        updatedPlayer.current_sector,
        result.message,
        {
          winner: result.winner,
          damageDealt: result.attackerDestroyed ? 0 : result.defenderFightersLost,
          lootTaken: result.creditsLooted
        }
      );
    } catch (notifyError) {
      console.error('Failed to send combat notification:', notifyError);
      // Don't fail the request if notification fails
    }

    res.json({
      success: true,
      combat: {
        winner: result.winner,
        rounds: result.rounds,
        attackerFightersLost: result.attackerFightersLost,
        defenderFightersLost: result.defenderFightersLost,
        attackerShieldsLost: result.attackerShieldsLost,
        defenderShieldsLost: result.defenderShieldsLost,
        defenderDestroyed: result.defenderDestroyed,
        attackerDestroyed: result.attackerDestroyed,
        creditsLooted: result.creditsLooted,
        creditsLostByAttacker: result.creditsLostByAttacker,
        cargoLooted: result.cargoLooted,
        cargoLostByAttacker: result.cargoLostByAttacker,
        colonistsLostAttacker: result.colonistsLostAttacker,
        colonistsLostDefender: result.colonistsLostDefender,
        attackerEscapeSector: result.attackerEscapeSector,
        defenderEscapeSector: result.defenderEscapeSector,
        message: result.message,
        combatLog: result.combatLog
      },
      player: {
        id: updatedPlayer.id,
        corpName: updatedPlayer.corp_name,
        currentSector: updatedPlayer.current_sector,
        credits: parseInt(updatedPlayer.credits),
        turnsRemaining: updatedPlayer.turns_remaining,
        shipType: updatedPlayer.ship_type,
        shipHoldsMax: updatedPlayer.ship_holds_max,
        shipFighters: updatedPlayer.ship_fighters,
        shipShields: updatedPlayer.ship_shields,
        cargoFuel: updatedPlayer.cargo_fuel,
        cargoOrganics: updatedPlayer.cargo_organics,
        cargoEquipment: updatedPlayer.cargo_equipment,
        kills: updatedPlayer.kills,
        deaths: updatedPlayer.deaths,
        alignment: updatedPlayer.alignment,
        inEscapePod: updatedPlayer.in_escape_pod
      }
    });
  } catch (error) {
    console.error('Error in combat:', error);
    res.status(500).json({ error: 'Combat failed' });
  }
};

/**
 * Get players in current sector that can be attacked
 * GET /api/combat/targets
 */
export const getTargets = async (req: Request, res: Response) => {
  try {
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
    const targets = await getAttackableTargets(playerId);

    res.json({ targets });
  } catch (error) {
    console.error('Error getting targets:', error);
    res.status(500).json({ error: 'Failed to get targets' });
  }
};

/**
 * Get combat history for the player
 * GET /api/combat/history
 */
export const getHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const limit = parseInt(req.query.limit as string) || 20;

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
    const history = await getCombatHistory(playerId, limit);

    // Format the response
    const formattedHistory = history.map(h => ({
      id: h.id,
      sectorNumber: h.sector_number,
      attacker: {
        id: h.attacker_id,
        name: h.attacker_name,
        username: h.attacker_username,
        ship: h.attacker_ship
      },
      defender: {
        id: h.defender_id,
        name: h.defender_name,
        username: h.defender_username,
        ship: h.defender_ship
      },
      winnerId: h.winner_id,
      creditsLooted: parseInt(h.credits_looted) || 0,
      cargoLooted: h.cargo_looted,
      rounds: h.rounds_fought,
      attackerFightersLost: h.attacker_fighters_lost,
      defenderFightersLost: h.defender_fighters_lost,
      defenderDestroyed: h.defender_destroyed,
      isAttacker: h.attacker_id === playerId,
      createdAt: h.created_at
    }));

    res.json({ history: formattedHistory });
  } catch (error) {
    console.error('Error getting combat history:', error);
    res.status(500).json({ error: 'Failed to get combat history' });
  }
};

/**
 * Check if player can attack a specific target
 * GET /api/combat/can-attack/:targetId
 */
export const checkCanAttack = async (req: Request, res: Response) => {
  try {
    const { targetId } = req.params;
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
    const result = await canAttack(playerId, parseInt(targetId));

    res.json(result);
  } catch (error) {
    console.error('Error checking attack:', error);
    res.status(500).json({ error: 'Failed to check attack' });
  }
};

