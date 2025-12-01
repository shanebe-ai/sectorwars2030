import { query, getClient } from '../db/connection';
import { sendMessage } from './messageService';

export const BEACON_PRICE = 500; // Credits per beacon

/**
 * Get beacon capacity based on ship type
 */
export const getBeaconCapacity = (shipType: string): number => {
  const shipTypeLower = shipType.toLowerCase();
  
  if (shipTypeLower === 'escape pod') {
    return 1;
  } else if (shipTypeLower === 'scout' || shipTypeLower === 'trader') {
    return 5;
  } else {
    // Freighter, Merchant Cruiser, Corporate Flagship
    return 15;
  }
};

/**
 * Purchase beacons at StarDock
 */
export const purchaseBeacons = async (
  playerId: number,
  quantity: number
): Promise<{ success: boolean; message: string; newBeaconCount?: number }> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get player data
    const playerResult = await client.query(
      `SELECT id, credits, ship_type, ship_beacons, current_sector
       FROM players WHERE id = $1 FOR UPDATE`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found' };
    }

    const player = playerResult.rows[0];

    // Check if at a StarDock
    const sectorResult = await client.query(
      `SELECT port_type FROM sectors s
       JOIN players p ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
       WHERE p.id = $1`,
      [playerId]
    );

    if (sectorResult.rows.length === 0 || sectorResult.rows[0].port_type !== 'STARDOCK') {
      await client.query('ROLLBACK');
      return { success: false, message: 'Must be at a StarDock to purchase beacons' };
    }

    // Check beacon capacity
    const maxBeacons = getBeaconCapacity(player.ship_type);
    const currentBeacons = player.ship_beacons || 0;
    
    if (currentBeacons + quantity > maxBeacons) {
      await client.query('ROLLBACK');
      return { success: false, message: `Your ${player.ship_type} can only hold ${maxBeacons} beacons (you have ${currentBeacons})` };
    }

    // Check credits
    const totalCost = BEACON_PRICE * quantity;
    if (player.credits < totalCost) {
      await client.query('ROLLBACK');
      return { success: false, message: `Insufficient credits. Need ₡${totalCost.toLocaleString()}` };
    }

    // Purchase beacons
    await client.query(
      `UPDATE players SET credits = credits - $1, ship_beacons = ship_beacons + $2 WHERE id = $3`,
      [totalCost, quantity, playerId]
    );

    await client.query('COMMIT');

    return {
      success: true,
      message: `Purchased ${quantity} beacon(s) for ₡${totalCost.toLocaleString()}`,
      newBeaconCount: currentBeacons + quantity
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Launch a beacon in the current sector
 */
export const launchBeacon = async (
  playerId: number,
  message: string
): Promise<{ success: boolean; message: string }> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Validate message length
    if (!message || message.trim().length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Beacon message cannot be empty' };
    }

    if (message.length > 255) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Beacon message cannot exceed 255 characters' };
    }

    // Get player data
    const playerResult = await client.query(
      `SELECT p.id, p.universe_id, p.current_sector, p.ship_beacons, p.corp_name
       FROM players p WHERE p.id = $1 FOR UPDATE`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found' };
    }

    const player = playerResult.rows[0];

    // Check if in TerraSpace (safe zone - no beacons allowed)
    const sectorResult = await client.query(
      `SELECT region FROM sectors WHERE universe_id = $1 AND sector_number = $2`,
      [player.universe_id, player.current_sector]
    );

    if (sectorResult.rows.length > 0 && sectorResult.rows[0].region === 'TerraSpace') {
      await client.query('ROLLBACK');
      return { success: false, message: 'Beacons cannot be launched in TerraSpace (safe zone)' };
    }

    // Check if player has beacons
    if (!player.ship_beacons || player.ship_beacons <= 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'You have no beacons to launch' };
    }

    // Check if player already has a beacon in this sector
    const existingResult = await client.query(
      `SELECT id FROM sector_beacons WHERE universe_id = $1 AND sector_number = $2 AND owner_id = $3`,
      [player.universe_id, player.current_sector, playerId]
    );

    if (existingResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'You already have a beacon in this sector' };
    }

    // Launch the beacon
    await client.query(
      `INSERT INTO sector_beacons (universe_id, sector_number, owner_id, owner_name, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [player.universe_id, player.current_sector, playerId, player.corp_name, message.trim()]
    );

    // Decrement player's beacon count
    await client.query(
      `UPDATE players SET ship_beacons = ship_beacons - 1 WHERE id = $1`,
      [playerId]
    );

    await client.query('COMMIT');

    return { success: true, message: `Beacon launched in Sector ${player.current_sector}` };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get beacons in a sector
 */
export const getSectorBeacons = async (
  universeId: number,
  sectorNumber: number
): Promise<any[]> => {
  const result = await query(
    `SELECT id, owner_id, owner_name, message, created_at
     FROM sector_beacons
     WHERE universe_id = $1 AND sector_number = $2
     ORDER BY created_at DESC`,
    [universeId, sectorNumber]
  );
  return result.rows;
};

/**
 * Get all beacons owned by a player
 */
export const getPlayerBeacons = async (playerId: number): Promise<any[]> => {
  const result = await query(
    `SELECT id, sector_number, message, created_at
     FROM sector_beacons
     WHERE owner_id = $1
     ORDER BY created_at DESC`,
    [playerId]
  );
  return result.rows;
};

/**
 * Attack and destroy a beacon
 */
export const attackBeacon = async (
  attackerId: number,
  beaconId: number
): Promise<{ success: boolean; message: string; fightersLost: number }> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get attacker data with username
    const attackerResult = await client.query(
      `SELECT p.id, p.universe_id, p.current_sector, p.ship_fighters, p.corp_name, u.username
       FROM players p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1 FOR UPDATE`,
      [attackerId]
    );

    if (attackerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found', fightersLost: 0 };
    }

    const attacker = attackerResult.rows[0];

    // Get beacon data with owner username
    // Use FOR UPDATE OF sb to lock only the sector_beacons table (not the joined tables)
    const beaconResult = await client.query(
      `SELECT sb.id, sb.universe_id, sb.sector_number, sb.owner_id, sb.owner_name, u.username as owner_username
       FROM sector_beacons sb
       LEFT JOIN players p ON sb.owner_id = p.id
       LEFT JOIN users u ON p.user_id = u.id
       WHERE sb.id = $1 FOR UPDATE OF sb`,
      [beaconId]
    );

    if (beaconResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Beacon not found', fightersLost: 0 };
    }

    const beacon = beaconResult.rows[0];

    // Debug logging
    console.log('[beaconService] Beacon attack validation:', {
      beaconUniverseId: beacon.universe_id,
      attackerUniverseId: attacker.universe_id,
      beaconSector: beacon.sector_number,
      attackerSector: attacker.current_sector,
      beaconOwnerId: beacon.owner_id,
      attackerId: attackerId
    });

    // Validate attacker is in same sector
    if (beacon.universe_id !== attacker.universe_id || beacon.sector_number !== attacker.current_sector) {
      await client.query('ROLLBACK');
      return { 
        success: false, 
        message: `Beacon is not in your sector. Beacon: Sector ${beacon.sector_number}, You: Sector ${attacker.current_sector}`, 
        fightersLost: 0 
      };
    }

    // Cannot attack own beacon
    if (beacon.owner_id === attackerId) {
      await client.query('ROLLBACK');
      return { success: false, message: 'You cannot attack your own beacon', fightersLost: 0 };
    }

    // Check if attacker has fighters
    if (attacker.ship_fighters <= 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'You need fighters to attack a beacon', fightersLost: 0 };
    }

    // Calculate fighters lost (0-5 random)
    const fightersLost = Math.min(Math.floor(Math.random() * 6), attacker.ship_fighters);

    // Deduct fighters from attacker
    await client.query(
      `UPDATE players SET ship_fighters = ship_fighters - $1 WHERE id = $2`,
      [fightersLost, attackerId]
    );

    // Send message to beacon owner
    if (beacon.owner_id) {
      try {
        // Get beacon owner's username for the sender name
        const ownerUsername = beacon.owner_username || beacon.owner_name || 'Unknown';
        const attackerUsername = (attacker.username || 'Unknown Attacker').toString();
        const attackerCorp = (attacker.corp_name || 'Unknown Corp').toString();
        const sectorNum = (beacon.sector_number || 'Unknown').toString();
        const senderName = `${ownerUsername}'s Beacon - Sector ${sectorNum}`;
        
        await client.query(
          `INSERT INTO messages (universe_id, sender_id, recipient_id, sender_name, subject, body, message_type)
           SELECT universe_id, NULL, $1, $2, $3, $4, 'DIRECT'
           FROM players WHERE id = $1`,
          [
            beacon.owner_id,
            senderName,
            'BEACON DESTROYED',
            `⚠️ EMERGENCY TRANSMISSION ⚠️\n\nYour beacon in Sector ${sectorNum} is under attack!\n\nAttacker: ${attackerUsername} (${attackerCorp})\n\nThis beacon will not survive the encounter...\n\n[SIGNAL LOST]`
          ]
        );
      } catch (msgError: any) {
        // Log but don't fail the attack if message sending fails
        console.error('[beaconService] Failed to send beacon attack message:', msgError);
      }
    }

    // Destroy the beacon
    try {
      await client.query(`DELETE FROM sector_beacons WHERE id = $1`, [beaconId]);
    } catch (deleteError: any) {
      console.error('[beaconService] Error deleting beacon:', deleteError);
      // If beacon already deleted, that's okay - continue
      if (!deleteError.message.includes('does not exist')) {
        await client.query('ROLLBACK');
        throw deleteError;
      }
    }

    await client.query('COMMIT');

    return {
      success: true,
      message: `Beacon destroyed! Lost ${fightersLost} fighter${fightersLost !== 1 ? 's' : ''} in the attack.`,
      fightersLost
    };
  } catch (error: any) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError: any) {
      console.error('[beaconService] Error during rollback:', rollbackError);
    }
    console.error('[beaconService] Error attacking beacon:', error);
    console.error('[beaconService] Error details:', {
      attackerId,
      beaconId,
      message: error.message,
      stack: error.stack
    });
    // Return error instead of throwing to prevent server crash
    return {
      success: false,
      message: error.message || 'Failed to attack beacon',
      fightersLost: 0
    };
  } finally {
    try {
      client.release();
    } catch (releaseError: any) {
      console.error('[beaconService] Error releasing client:', releaseError);
    }
  }
};

/**
 * Retrieve (pick up) your own beacon
 */
export const retrieveBeacon = async (
  playerId: number,
  beaconId: number
): Promise<{ success: boolean; message: string }> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get player data
    const playerResult = await client.query(
      `SELECT id, universe_id, current_sector, ship_type, ship_beacons
       FROM players WHERE id = $1 FOR UPDATE`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found' };
    }

    const player = playerResult.rows[0];

    // Get beacon data
    const beaconResult = await client.query(
      `SELECT id, sector_number, owner_id FROM sector_beacons WHERE id = $1`,
      [beaconId]
    );

    if (beaconResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Beacon not found' };
    }

    const beacon = beaconResult.rows[0];

    // Must be owner
    if (beacon.owner_id !== playerId) {
      await client.query('ROLLBACK');
      return { success: false, message: 'This is not your beacon' };
    }

    // Must be in same sector
    if (beacon.sector_number !== player.current_sector) {
      await client.query('ROLLBACK');
      return { success: false, message: 'You must be in the same sector to retrieve your beacon' };
    }

    // Check beacon capacity
    const maxBeacons = getBeaconCapacity(player.ship_type);
    if (player.ship_beacons >= maxBeacons) {
      await client.query('ROLLBACK');
      return { success: false, message: `Your ship cannot hold any more beacons (max ${maxBeacons})` };
    }

    // Delete beacon and add to player inventory
    await client.query(`DELETE FROM sector_beacons WHERE id = $1`, [beaconId]);
    await client.query(`UPDATE players SET ship_beacons = ship_beacons + 1 WHERE id = $1`, [playerId]);

    await client.query('COMMIT');

    return { success: true, message: 'Beacon retrieved' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

