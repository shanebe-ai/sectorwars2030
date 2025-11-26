import { Request, Response } from 'express';
import { pool } from '../db/connection';

/**
 * Get sector details including warps
 */
export const getSectorDetails = async (req: Request, res: Response) => {
  try {
    const { sectorNumber } = req.params;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get the player's universe
    const playerResult = await pool.query(
      'SELECT universe_id FROM players WHERE user_id = $1',
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const universeId = playerResult.rows[0].universe_id;

    // Get sector details
    const sectorResult = await pool.query(
      `SELECT
        s.id,
        s.sector_number,
        s.name,
        s.port_type,
        s.port_fuel_qty,
        s.port_organics_qty,
        s.port_equipment_qty,
        s.port_fuel_pct,
        s.port_organics_pct,
        s.port_equipment_pct,
        s.port_class,
        s.has_planet,
        s.has_beacon,
        s.fighters_count,
        s.mines_count
      FROM sectors s
      WHERE s.universe_id = $1 AND s.sector_number = $2`,
      [universeId, sectorNumber]
    );

    if (sectorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Sector not found' });
    }

    const sector = sectorResult.rows[0];

    // Get warps for this sector (bidirectional lookup)
    // Look for warps FROM this sector AND warps TO this sector (filtered by universe)
    const warpsResult = await pool.query(
      `SELECT DISTINCT
        CASE
          WHEN sw.sector_id = $1 THEN sw.destination_sector_number
          ELSE (SELECT sector_number FROM sectors WHERE id = sw.sector_id)
        END as destination,
        sw.is_two_way
       FROM sector_warps sw
       JOIN sectors s ON sw.sector_id = s.id
       WHERE s.universe_id = $3 AND (sw.sector_id = $1 OR sw.destination_sector_number = $2)
       ORDER BY destination`,
      [sector.id, sector.sector_number, universeId]
    );

    const warps = warpsResult.rows.map(w => ({
      destination: w.destination,
      isTwoWay: w.is_two_way
    }));

    // Get players in this sector
    const playersResult = await pool.query(
      `SELECT
        p.id,
        p.corp_name,
        p.ship_type,
        p.alignment,
        p.ship_fighters,
        u.username
      FROM players p
      JOIN users u ON p.user_id = u.id
      WHERE p.universe_id = $1 AND p.current_sector = $2 AND p.is_alive = true`,
      [universeId, sectorNumber]
    );

    const players = playersResult.rows.map(p => ({
      id: p.id,
      corpName: p.corp_name,
      shipType: p.ship_type,
      alignment: p.alignment,
      fighters: p.ship_fighters,
      username: p.username
    }));

    // Get planet data if sector has a planet
    let planets = [];
    if (sector.has_planet) {
      const planetsResult = await pool.query(
        `SELECT
          pl.id,
          pl.name,
          pl.owner_id,
          COALESCE(pl.owner_name, p.corp_name) as owner_name
        FROM planets pl
        LEFT JOIN players p ON pl.owner_id = p.id
        WHERE pl.sector_id = $1`,
        [sector.id]
      );

      planets = planetsResult.rows.map(pl => ({
        id: pl.id,
        name: pl.name,
        ownerId: pl.owner_id,
        ownerName: pl.owner_name
      }));
    }

    res.json({
      sector: {
        sectorNumber: sector.sector_number,
        name: sector.name,
        portType: sector.port_type,
        hasPort: !!sector.port_type,
        portClass: sector.port_class,
        hasPlanet: sector.has_planet,
        hasBeacon: sector.has_beacon,
        fightersCount: sector.fighters_count,
        minesCount: sector.mines_count,
        warps,
        players,
        planets
      }
    });
  } catch (error) {
    console.error('Error getting sector details:', error);
    res.status(500).json({ error: 'Failed to get sector details' });
  }
};

/**
 * Move player to a new sector
 */
export const moveToSector = async (req: Request, res: Response) => {
  try {
    const { destinationSector } = req.body;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!destinationSector || typeof destinationSector !== 'number') {
      return res.status(400).json({ error: 'Invalid destination sector' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get player's current location and turns
      const playerResult = await client.query(
        `SELECT
          p.id,
          p.universe_id,
          p.current_sector,
          p.turns_remaining,
          p.ship_type,
          s.id as current_sector_id
        FROM players p
        JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
        WHERE p.user_id = $1`,
        [userId]
      );

      if (playerResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Player not found' });
      }

      const player = playerResult.rows[0];

      // Check if player has enough turns
      if (player.turns_remaining <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Not enough turns remaining' });
      }

      // Check if the destination sector is connected via a warp (bidirectional check)
      const warpResult = await client.query(
        `SELECT id FROM sector_warps
         WHERE (sector_id = $1 AND destination_sector_number = $2)
            OR (sector_id IN (SELECT id FROM sectors WHERE sector_number = $2 AND universe_id = $3)
                AND destination_sector_number = $4)`,
        [player.current_sector_id, destinationSector, player.universe_id, player.current_sector]
      );

      if (warpResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No warp connection to that sector' });
      }

      // Check if destination sector exists
      const destResult = await client.query(
        `SELECT id FROM sectors
         WHERE universe_id = $1 AND sector_number = $2`,
        [player.universe_id, destinationSector]
      );

      if (destResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Destination sector not found' });
      }

      // Get ship type to determine turn cost (default 1 turn per move for now)
      const turnCost = 1;

      // Warp drive misfire chance (0.25% chance of malfunction)
      const MISFIRE_CHANCE = 0.0025; // 0.25% = 0.0025
      const misfired = Math.random() < MISFIRE_CHANCE;

      let actualDestination = destinationSector;
      let misfireMessage = null;

      if (misfired) {
        // Get a random sector from the universe (excluding current sector)
        const randomSectorResult = await client.query(
          `SELECT sector_number FROM sectors
           WHERE universe_id = $1 AND sector_number != $2
           ORDER BY RANDOM()
           LIMIT 1`,
          [player.universe_id, player.current_sector]
        );

        if (randomSectorResult.rows.length > 0) {
          actualDestination = randomSectorResult.rows[0].sector_number;
          misfireMessage = `⚠ WARP DRIVE MALFUNCTION! Intended destination: Sector ${destinationSector}, actual arrival: Sector ${actualDestination}`;
        }
      }

      // Update player location and turns
      const updateResult = await client.query(
        `UPDATE players
         SET current_sector = $1,
             turns_remaining = turns_remaining - $2
         WHERE id = $3
         RETURNING
           id,
           corp_name,
           current_sector,
           credits,
           turns_remaining,
           ship_type,
           ship_holds_max,
           ship_fighters,
           ship_shields,
           cargo_fuel,
           cargo_organics,
           cargo_equipment`,
        [actualDestination, turnCost, player.id]
      );

      // Log the movement event
      await client.query(
        `INSERT INTO game_events (universe_id, player_id, event_type, event_data, sector_number)
         VALUES ($1, $2, 'movement', $3, $4)`,
        [
          player.universe_id,
          player.id,
          JSON.stringify({
            from: player.current_sector,
            to: actualDestination,
            intended: destinationSector,
            misfired,
            turnCost
          }),
          actualDestination
        ]
      );

      await client.query('COMMIT');

      const updatedPlayer = updateResult.rows[0];

      res.json({
        success: true,
        player: {
          id: updatedPlayer.id,
          corpName: updatedPlayer.corp_name,
          currentSector: updatedPlayer.current_sector,
          credits: updatedPlayer.credits,
          turnsRemaining: updatedPlayer.turns_remaining,
          shipType: updatedPlayer.ship_type,
          shipHoldsMax: updatedPlayer.ship_holds_max,
          shipFighters: updatedPlayer.ship_fighters,
          shipShields: updatedPlayer.ship_shields,
          cargoFuel: updatedPlayer.cargo_fuel,
          cargoOrganics: updatedPlayer.cargo_organics,
          cargoEquipment: updatedPlayer.cargo_equipment
        },
        turnCost,
        misfired,
        misfireMessage
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error moving to sector:', error);
    res.status(500).json({ error: 'Failed to move to sector' });
  }
};
