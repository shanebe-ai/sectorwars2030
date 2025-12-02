import { Request, Response } from 'express';
import { pool } from '../db/connection';
import { recordEncounter } from '../services/messageService';
import { autoLogSector } from '../services/shipLogService';
import { emitSectorEvent } from '../index';
import { checkMinesOnEntry } from '../services/mineService';

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

    // Get the player's universe and current sector
    const playerResult = await pool.query(
      'SELECT id, universe_id, current_sector FROM players WHERE user_id = $1',
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const playerId = playerResult.rows[0].id;
    const universeId = playerResult.rows[0].universe_id;
    const currentSector = playerResult.rows[0].current_sector;

    // Get sector details
    const sectorResult = await pool.query(
      `SELECT
        s.id,
        s.sector_number,
        s.name,
        s.region,
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
        p.ship_shields,
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
      shields: p.ship_shields,
      username: p.username
    }));

    // If player is viewing their current sector, record encounters with others there
    if (parseInt(sectorNumber as string) === currentSector) {
      for (const otherPlayer of playersResult.rows) {
        if (otherPlayer.id !== playerId) {
          // Record encounters bidirectionally (fire and forget, don't block response)
          recordEncounter(playerId, otherPlayer.id, universeId).catch(() => {});
          recordEncounter(otherPlayer.id, playerId, universeId).catch(() => {});
        }
      }
    }

    // Get planet data if sector has a planet
    let planets: Array<{ id: number; name: string; ownerId: number | null; ownerName: string | null }> = [];
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

    // Get floating cargo in sector
    const cargoResult = await pool.query(
      `SELECT id, fuel, organics, equipment, colonists, source_event, created_at
       FROM sector_cargo 
       WHERE universe_id = $1 AND sector_number = $2 
       AND expires_at > NOW()
       AND (fuel > 0 OR organics > 0 OR equipment > 0 OR colonists > 0)`,
      [universeId, sectorNumber]
    );

    const floatingCargo = cargoResult.rows.map(c => ({
      id: c.id,
      fuel: c.fuel,
      organics: c.organics,
      equipment: c.equipment,
      colonists: c.colonists,
      source: c.source_event,
      createdAt: c.created_at
    }));

    // Get beacons in sector
    let beacons: any[] = [];
    try {
      const beaconResult = await pool.query(
        `SELECT id, owner_id, owner_name, message, created_at
         FROM sector_beacons
         WHERE universe_id = $1 AND sector_number = $2
         ORDER BY created_at DESC`,
        [universeId, sectorNumber]
      );

      beacons = beaconResult.rows.map(b => ({
        id: b.id,
        ownerId: b.owner_id,
        ownerName: b.owner_name || 'Unknown',
        message: b.message || '',
        createdAt: b.created_at
      }));
    } catch (beaconError: any) {
      console.error('Error fetching beacons:', beaconError);
      // Continue without beacons rather than crashing
      beacons = [];
    }

    // Get deployed fighters in sector
    const deployedFightersResult = await pool.query(
      `SELECT id, owner_id, owner_name, fighter_count, deployed_at
       FROM sector_fighters
       WHERE universe_id = $1 AND sector_number = $2 AND fighter_count > 0
       ORDER BY fighter_count DESC`,
      [universeId, sectorNumber]
    );

    const deployedFighters = deployedFightersResult.rows.map(f => ({
      id: f.id,
      ownerId: f.owner_id,
      ownerName: f.owner_name,
      fighterCount: f.fighter_count,
      deployedAt: f.deployed_at,
      isOwn: f.owner_id === playerId
    }));

    // Check for hostile fighters (not owned by player)
    const hostileFighters = deployedFighters.filter(f => !f.isOwn);

    // Auto-log sector when viewing current sector (for initial spawn and returning visits)
    if (parseInt(sectorNumber as string) === currentSector) {
      // Get planet name if exists
      const planetName = planets.length > 0 ? planets[0].name : undefined;
      
      // Fire and forget - don't block the response
      autoLogSector(playerId, universeId, {
        sector_number: sector.sector_number,
        name: sector.name,
        port_type: sector.port_type,
        has_planet: sector.has_planet,
        planet_name: planetName,
        warp_count: warps.length
      }).catch(err => console.error('Failed to auto-log sector:', err));
    }

    res.json({
      sector: {
        sectorNumber: sector.sector_number,
        name: sector.name,
        region: sector.region,
        portType: sector.port_type,
        hasPort: !!sector.port_type,
        portClass: sector.port_class,
        hasPlanet: sector.has_planet,
        hasBeacon: beacons.length > 0,
        fightersCount: sector.fighters_count,
        minesCount: sector.mines_count,
        warps,
        players,
        planets,
        floatingCargo,
        beacons,
        deployedFighters,
        hasHostileFighters: hostileFighters.length > 0,
        hostileFighterCount: hostileFighters.reduce((sum, f) => sum + f.fighterCount, 0)
      }
    });
  } catch (error: any) {
    console.error('Error getting sector details:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      sectorNumber: req.params.sectorNumber,
      userId: (req as any).user?.userId,
      message: error.message
    });
    res.status(500).json({ 
      error: 'Failed to get sector details',
      details: error.message || 'Unknown error'
    });
  }
};

/**
 * Move player to a new sector
 */
/**
 * Scan an adjoining sector (costs 1 turn, shows sector info without moving)
 * POST /api/sectors/scan/:sectorNumber
 */
export const scanSector = async (req: Request, res: Response) => {
  try {
    const { sectorNumber } = req.params;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const targetSector = parseInt(sectorNumber);
    if (isNaN(targetSector)) {
      return res.status(400).json({ error: 'Invalid sector number' });
    }

    // Get player data
    const playerResult = await pool.query(
      `SELECT id, universe_id, current_sector, turns_remaining
       FROM players WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const player = playerResult.rows[0];

    // Check turns
    if (player.turns_remaining < 1) {
      return res.status(400).json({ error: 'Not enough turns to scan' });
    }

    // Verify target sector is connected to current sector
    const currentSectorResult = await pool.query(
      `SELECT id FROM sectors WHERE universe_id = $1 AND sector_number = $2`,
      [player.universe_id, player.current_sector]
    );

    if (currentSectorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Current sector not found' });
    }

    const currentSectorId = currentSectorResult.rows[0].id;

    // Check warp connection
    const warpResult = await pool.query(
      `SELECT 1 FROM sector_warps sw
       WHERE (sw.sector_id = $1 AND sw.destination_sector_number = $2)
       OR EXISTS (
         SELECT 1 FROM sector_warps sw2
         JOIN sectors s ON sw2.sector_id = s.id
         WHERE s.universe_id = $3 AND s.sector_number = $2 
         AND sw2.destination_sector_number = $4 AND sw2.is_two_way = true
       )`,
      [currentSectorId, targetSector, player.universe_id, player.current_sector]
    );

    if (warpResult.rows.length === 0) {
      return res.status(400).json({ error: 'Sector is not adjacent to your current location' });
    }

    // Get target sector details
    const sectorResult = await pool.query(
      `SELECT
        s.id,
        s.sector_number,
        s.name,
        s.region,
        s.port_type,
        s.port_fuel_pct,
        s.port_organics_pct,
        s.port_equipment_pct,
        s.port_class,
        s.has_planet,
        s.fighters_count,
        s.mines_count,
        s.has_beacon
      FROM sectors s
      WHERE s.universe_id = $1 AND s.sector_number = $2`,
      [player.universe_id, targetSector]
    );

    if (sectorResult.rows.length === 0) {
      return res.status(404).json({ error: 'Target sector not found' });
    }

    const sector = sectorResult.rows[0];

    // Get ships in sector with details
    const shipsResult = await pool.query(
      `SELECT
        p.id,
        p.corp_name,
        p.ship_type,
        p.ship_fighters,
        p.ship_shields,
        u.username
      FROM players p
      JOIN users u ON p.user_id = u.id
      WHERE p.universe_id = $1 AND p.current_sector = $2 AND p.is_alive = true`,
      [player.universe_id, targetSector]
    );
    const ships = shipsResult.rows.map(s => ({
      id: s.id,
      corpName: s.corp_name,
      username: s.username,
      shipType: s.ship_type,
      fighters: s.ship_fighters,
      shields: s.ship_shields
    }));

    // Get deployed fighters with owner info
    const fightersResult = await pool.query(
      `SELECT
        sf.owner_id,
        sf.owner_name,
        sf.fighter_count
      FROM sector_fighters sf
      WHERE sf.universe_id = $1 AND sf.sector_number = $2 AND sf.fighter_count > 0`,
      [player.universe_id, targetSector]
    );
    const deployedFighters = fightersResult.rows.map(f => ({
      ownerId: f.owner_id,
      ownerName: f.owner_name,
      fighterCount: f.fighter_count
    }));

    // Get warps from target sector
    const warpsResult = await pool.query(
      `SELECT DISTINCT
        CASE
          WHEN sw.sector_id = $1 THEN sw.destination_sector_number
          ELSE (SELECT sector_number FROM sectors WHERE id = sw.sector_id)
        END as destination
       FROM sector_warps sw
       JOIN sectors s ON sw.sector_id = s.id
       WHERE s.universe_id = $2 AND (sw.sector_id = $1 OR sw.destination_sector_number = $3)
       ORDER BY destination`,
      [sector.id, player.universe_id, targetSector]
    );
    const warps = warpsResult.rows.map(w => w.destination);

    // Get planet info if exists
    let planetInfo = null;
    if (sector.has_planet) {
      const planetResult = await pool.query(
        `SELECT name, owner_id, owner_name FROM planets WHERE sector_id = $1`,
        [sector.id]
      );
      if (planetResult.rows.length > 0) {
        planetInfo = {
          name: planetResult.rows[0].name,
          ownerId: planetResult.rows[0].owner_id,
          ownerName: planetResult.rows[0].owner_name
        };
      }
    }

    // Get beacons in sector (but don't show messages in scan)
    const beaconsResult = await pool.query(
      `SELECT id, owner_id, owner_name, created_at
       FROM sector_beacons
       WHERE universe_id = $1 AND sector_number = $2
       ORDER BY created_at DESC`,
      [player.universe_id, targetSector]
    );
    const beacons = beaconsResult.rows.map(b => ({
      id: b.id,
      ownerId: b.owner_id,
      ownerName: b.owner_name,
      createdAt: b.created_at
    }));

    // Get floating cargo in sector
    const cargoResult = await pool.query(
      `SELECT id, fuel, organics, equipment, colonists, source_event, created_at
       FROM sector_cargo 
       WHERE universe_id = $1 AND sector_number = $2 
       AND expires_at > NOW()
       AND (fuel > 0 OR organics > 0 OR equipment > 0 OR colonists > 0)`,
      [player.universe_id, targetSector]
    );
    const floatingCargo = cargoResult.rows.map(c => ({
      id: c.id,
      fuel: c.fuel,
      organics: c.organics,
      equipment: c.equipment,
      colonists: c.colonists,
      source: c.source_event,
      createdAt: c.created_at
    }));

    // Deduct turn
    await pool.query(
      `UPDATE players SET turns_remaining = turns_remaining - 1 WHERE id = $1`,
      [player.id]
    );

    // Build port info with buy/sell flags
    let portInfo = null;
    if (sector.port_type) {
      const portType = sector.port_type;
      const buyFlags = {
        fuel: portType[0] === 'B',
        organics: portType[1] === 'B',
        equipment: portType[2] === 'B'
      };
      const sellFlags = {
        fuel: portType[0] === 'S',
        organics: portType[1] === 'S',
        equipment: portType[2] === 'S'
      };
      portInfo = {
        type: portType,
        class: sector.port_class,
        buyFlags,
        sellFlags,
        fuelPct: sector.port_fuel_pct,
        organicsPct: sector.port_organics_pct,
        equipmentPct: sector.port_equipment_pct
      };
    }

    res.json({
      scan: {
        sectorNumber: sector.sector_number,
        name: sector.name,
        region: sector.region,
        portInfo,
        planetInfo,
        ships,
        deployedFighters,
        beacons,
        hasBeacon: beacons.length > 0,
        floatingCargo,
        fightersCount: sector.fighters_count || 0,
        minesCount: sector.mines_count || 0,
        warps
      }
    });
  } catch (error: any) {
    console.error('Error scanning sector:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      sectorNumber: req.params.sectorNumber,
      userId: (req as any).user?.userId,
      message: error.message
    });
    res.status(500).json({ 
      error: 'Failed to scan sector',
      details: error.message || 'Unknown error'
    });
  }
};

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

      // Check if the destination sector is connected via a warp
      // Check for forward warp (current -> destination)
      const forwardWarpResult = await client.query(
        `SELECT sw.id, sw.is_two_way
         FROM sector_warps sw
         WHERE sw.sector_id = $1 AND sw.destination_sector_number = $2`,
        [player.current_sector_id, destinationSector]
      );

      // Check for reverse warp (destination -> current) if forward doesn't exist
      const reverseWarpResult = await client.query(
        `SELECT sw.id, sw.is_two_way
         FROM sector_warps sw
         JOIN sectors s ON sw.sector_id = s.id
         WHERE s.universe_id = $1 AND s.sector_number = $2 AND sw.destination_sector_number = $3 AND sw.is_two_way = true`,
        [player.universe_id, destinationSector, player.current_sector]
      );

      const hasWarpConnection = forwardWarpResult.rows.length > 0 || reverseWarpResult.rows.length > 0;

      if (!hasWarpConnection) {
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

      // Get other players in the destination sector and record encounters
      const otherPlayersResult = await client.query(
        `SELECT id FROM players
         WHERE universe_id = $1 AND current_sector = $2 AND id != $3 AND is_alive = true`,
        [player.universe_id, actualDestination, player.id]
      );

      // Record encounters with all players in the sector (bidirectional)
      for (const otherPlayer of otherPlayersResult.rows) {
        // Record that this player met the other player
        await recordEncounter(player.id, otherPlayer.id, player.universe_id);
        // Record that the other player met this player
        await recordEncounter(otherPlayer.id, player.id, player.universe_id);
      }

      // Get destination sector info for auto-logging
      const destSectorResult = await client.query(
        `SELECT 
          s.sector_number, s.name, s.port_type, s.has_planet,
          pl.name as planet_name,
          (SELECT COUNT(*) FROM sector_warps sw 
           JOIN sectors s2 ON sw.sector_id = s2.id 
           WHERE s2.universe_id = $1 AND (sw.sector_id = s.id OR sw.destination_sector_number = s.sector_number)
          ) as warp_count
         FROM sectors s
         LEFT JOIN planets pl ON pl.sector_id = s.id
         WHERE s.universe_id = $1 AND s.sector_number = $2`,
        [player.universe_id, actualDestination]
      );

      // Auto-log the sector discovery
      if (destSectorResult.rows[0]) {
        const sectorInfo = destSectorResult.rows[0];
        await autoLogSector(player.id, player.universe_id, {
          sector_number: sectorInfo.sector_number,
          name: sectorInfo.name,
          port_type: sectorInfo.port_type,
          has_planet: sectorInfo.has_planet,
          planet_name: sectorInfo.planet_name,
          warp_count: parseInt(sectorInfo.warp_count) || 0
        });
      }

      await client.query('COMMIT');

      const updatedPlayer = updateResult.rows[0];

      // Check for mines in destination sector (only if not same corp)
      let mineResult = null;
      try {
        mineResult = await checkMinesOnEntry(player.id, player.universe_id, actualDestination);
      } catch (mineError) {
        console.error('Error checking mines on entry:', mineError);
        // Don't block movement if mine check fails
      }

      // Check for beacons in destination sector and broadcast their messages
      const beaconsResult = await pool.query(
        `SELECT owner_name, message FROM sector_beacons
         WHERE universe_id = $1 AND sector_number = $2`,
        [player.universe_id, actualDestination]
      );

      // Emit WebSocket event to players in the destination sector
      emitSectorEvent(player.universe_id, actualDestination, 'ship_entered', {
        playerId: player.id,
        corpName: updatedPlayer.corp_name,
        shipType: updatedPlayer.ship_type,
        fromSector: player.current_sector,
        timestamp: new Date().toISOString()
      });

      // Broadcast beacon messages to all players in the sector (including the entering player)
      // Small delay to ensure WebSocket room join completes first
      setTimeout(() => {
        if (beaconsResult.rows.length > 0) {
          for (const beacon of beaconsResult.rows) {
            emitSectorEvent(player.universe_id, actualDestination, 'beacon_message', {
              ownerName: beacon.owner_name,
              message: beacon.message,
              timestamp: new Date().toISOString()
            });
          }
        }
      }, 100);

      // Also notify the sector they left
      emitSectorEvent(player.universe_id, player.current_sector, 'ship_left', {
        playerId: player.id,
        corpName: updatedPlayer.corp_name,
        shipType: updatedPlayer.ship_type,
        toSector: actualDestination,
        timestamp: new Date().toISOString()
      });

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
        misfireMessage,
        mineResult: mineResult || null
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
