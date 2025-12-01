import { query, getClient } from '../db/connection';

export interface FloatingCargo {
  id: number;
  universe_id: number;
  sector_number: number;
  fuel: number;
  organics: number;
  equipment: number;
  colonists: number;
  source_event: string;
  created_at: string;
  expires_at: string;
}

/**
 * Get floating cargo in a sector
 */
export const getFloatingCargo = async (
  universeId: number,
  sectorNumber: number
): Promise<FloatingCargo[]> => {
  const result = await query(
    `SELECT * FROM sector_cargo 
     WHERE universe_id = $1 AND sector_number = $2 
     AND expires_at > NOW()
     AND (fuel > 0 OR organics > 0 OR equipment > 0 OR colonists > 0)
     ORDER BY created_at DESC`,
    [universeId, sectorNumber]
  );
  return result.rows;
};

/**
 * Pick up floating cargo from a sector
 * Returns how much was actually picked up (limited by cargo space)
 */
export const pickupCargo = async (
  playerId: number,
  cargoId: number
): Promise<{
  success: boolean;
  fuelPickedUp: number;
  organicsPickedUp: number;
  equipmentPickedUp: number;
  colonistsPickedUp: number;
  remainingInSpace: boolean;
  message: string;
}> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get player data
    const playerResult = await client.query(
      `SELECT id, universe_id, current_sector, ship_holds_max,
              cargo_fuel, cargo_organics, cargo_equipment, colonists
       FROM players WHERE id = $1 FOR UPDATE`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, fuelPickedUp: 0, organicsPickedUp: 0, equipmentPickedUp: 0, colonistsPickedUp: 0, remainingInSpace: false, message: 'Player not found' };
    }

    const player = playerResult.rows[0];

    // Get cargo data
    const cargoResult = await client.query(
      `SELECT * FROM sector_cargo 
       WHERE id = $1 AND universe_id = $2 AND sector_number = $3 
       AND expires_at > NOW()
       FOR UPDATE`,
      [cargoId, player.universe_id, player.current_sector]
    );

    if (cargoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, fuelPickedUp: 0, organicsPickedUp: 0, equipmentPickedUp: 0, colonistsPickedUp: 0, remainingInSpace: false, message: 'Cargo not found or expired' };
    }

    const cargo = cargoResult.rows[0];

    // Calculate available space
    const currentCargo = player.cargo_fuel + player.cargo_organics + player.cargo_equipment;
    let freeSpace = player.ship_holds_max - currentCargo;

    // Pick up cargo in order: equipment > organics > fuel (by value)
    let equipmentPickedUp = Math.min(cargo.equipment, freeSpace);
    freeSpace -= equipmentPickedUp;

    let organicsPickedUp = Math.min(cargo.organics, freeSpace);
    freeSpace -= organicsPickedUp;

    let fuelPickedUp = Math.min(cargo.fuel, freeSpace);

    // Colonists use cargo holds too
    let colonistsPickedUp = Math.min(cargo.colonists, freeSpace - fuelPickedUp);

    // Update player cargo
    await client.query(
      `UPDATE players SET
        cargo_fuel = cargo_fuel + $1,
        cargo_organics = cargo_organics + $2,
        cargo_equipment = cargo_equipment + $3,
        colonists = colonists + $4
       WHERE id = $5`,
      [fuelPickedUp, organicsPickedUp, equipmentPickedUp, colonistsPickedUp, playerId]
    );

    // Update or delete floating cargo
    const remainingFuel = cargo.fuel - fuelPickedUp;
    const remainingOrganics = cargo.organics - organicsPickedUp;
    const remainingEquipment = cargo.equipment - equipmentPickedUp;
    const remainingColonists = cargo.colonists - colonistsPickedUp;

    const hasRemaining = remainingFuel > 0 || remainingOrganics > 0 || remainingEquipment > 0 || remainingColonists > 0;

    if (hasRemaining) {
      await client.query(
        `UPDATE sector_cargo SET
          fuel = $1, organics = $2, equipment = $3, colonists = $4
         WHERE id = $5`,
        [remainingFuel, remainingOrganics, remainingEquipment, remainingColonists, cargoId]
      );
    } else {
      await client.query('DELETE FROM sector_cargo WHERE id = $1', [cargoId]);
    }

    await client.query('COMMIT');

    const totalPickedUp = fuelPickedUp + organicsPickedUp + equipmentPickedUp + colonistsPickedUp;
    let message = `Picked up ${totalPickedUp} units of cargo`;
    if (hasRemaining) {
      message += ` (some cargo remains floating - cargo hold full)`;
    }

    return {
      success: true,
      fuelPickedUp,
      organicsPickedUp,
      equipmentPickedUp,
      colonistsPickedUp,
      remainingInSpace: hasRemaining,
      message
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Clean up expired floating cargo (run periodically)
 */
export const cleanupExpiredCargo = async (): Promise<number> => {
  const result = await query(
    `DELETE FROM sector_cargo WHERE expires_at < NOW() RETURNING id`
  );
  return result.rowCount || 0;
};

/**
 * Jettison cargo into space (player drops cargo)
 */
export const jettisonCargo = async (
  playerId: number,
  fuel: number,
  organics: number,
  equipment: number
): Promise<{ success: boolean; message: string }> => {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get player data
    const playerResult = await client.query(
      `SELECT id, universe_id, current_sector, cargo_fuel, cargo_organics, cargo_equipment
       FROM players WHERE id = $1 FOR UPDATE`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Player not found' };
    }

    const player = playerResult.rows[0];

    // Validate amounts
    if (fuel > player.cargo_fuel || organics > player.cargo_organics || equipment > player.cargo_equipment) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Cannot jettison more cargo than you have' };
    }

    if (fuel <= 0 && organics <= 0 && equipment <= 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Must jettison at least some cargo' };
    }

    // Remove from player
    await client.query(
      `UPDATE players SET
        cargo_fuel = cargo_fuel - $1,
        cargo_organics = cargo_organics - $2,
        cargo_equipment = cargo_equipment - $3
       WHERE id = $4`,
      [fuel, organics, equipment, playerId]
    );

    // Add to floating cargo
    await client.query(
      `INSERT INTO sector_cargo (universe_id, sector_number, fuel, organics, equipment, source_event, source_player_id)
       VALUES ($1, $2, $3, $4, $5, 'jettison', $6)`,
      [player.universe_id, player.current_sector, fuel, organics, equipment, playerId]
    );

    await client.query('COMMIT');

    return { success: true, message: `Jettisoned ${fuel + organics + equipment} units of cargo into space` };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

