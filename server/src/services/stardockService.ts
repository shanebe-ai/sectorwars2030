import { pool } from '../db/connection';

// Fighter and shield prices
const FIGHTER_PRICE = 100;   // 100 credits per fighter
const SHIELD_PRICE = 50;     // 50 credits per shield point

export interface ShipForSale {
  id: number;
  name: string;
  displayName: string;
  holds: number;
  fightersMax: number;
  shieldsMax: number;
  minesMax: number;
  genesisMax: number;
  cost: number;
  description: string;
  canAfford: boolean;
  isCurrentShip: boolean;
}

export interface StardockInfo {
  sectorNumber: number;
  name: string;
  ships: ShipForSale[];
  fighterPrice: number;
  shieldPrice: number;
  player: {
    credits: number;
    currentShip: string;
    fighters: number;
    fightersMax: number;
    shields: number;
    shieldsMax: number;
  };
}

export interface PurchaseResult {
  success: boolean;
  message: string;
  player: {
    credits: number;
    shipType?: string;
    shipHoldsMax?: number;
    fighters?: number;
    fightersMax?: number;
    shields?: number;
    shieldsMax?: number;
  };
}

/**
 * Get StarDock information including ships for sale
 */
export async function getStardockInfo(userId: number): Promise<StardockInfo | null> {
  // Get player info and current sector
  const playerResult = await pool.query(
    `SELECT p.*, s.port_type, s.name as sector_name, s.sector_number
     FROM players p
     JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
     WHERE p.user_id = $1`,
    [userId]
  );

  if (playerResult.rows.length === 0) {
    throw new Error('Player not found');
  }

  const player = playerResult.rows[0];

  // Check if player is at a StarDock
  if (player.port_type !== 'STARDOCK') {
    return null; // Not at a StarDock
  }

  // Get all ship types (global ones with universe_id = NULL)
  const shipsResult = await pool.query(
    `SELECT * FROM ship_types 
     WHERE universe_id IS NULL OR universe_id = $1
     ORDER BY cost_credits ASC`,
    [player.universe_id]
  );

  const ships: ShipForSale[] = shipsResult.rows.map(ship => ({
    id: ship.id,
    name: ship.name,
    displayName: ship.display_name || ship.name,
    holds: ship.holds,
    fightersMax: ship.fighters_max || ship.fighters || 0,
    shieldsMax: ship.shields_max || ship.shields || 0,
    minesMax: ship.mines_max || 0,
    genesisMax: ship.genesis_max || 0,
    cost: parseInt(ship.cost_credits) || 0,
    description: ship.description || '',
    canAfford: parseInt(player.credits) >= (parseInt(ship.cost_credits) || 0),
    isCurrentShip: player.ship_type?.toLowerCase() === ship.name?.toLowerCase(),
  }));

  return {
    sectorNumber: player.sector_number,
    name: player.sector_name || `StarDock`,
    ships,
    fighterPrice: FIGHTER_PRICE,
    shieldPrice: SHIELD_PRICE,
    player: {
      credits: parseInt(player.credits),
      currentShip: player.ship_type,
      fighters: player.ship_fighters || 0,
      fightersMax: player.ship_fighters_max || 0,
      shields: player.ship_shields || 0,
      shieldsMax: player.ship_shields_max || 0,
    },
  };
}

/**
 * Purchase a new ship at StarDock
 */
export async function purchaseShip(userId: number, shipName: string): Promise<PurchaseResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get player info
    const playerResult = await client.query(
      `SELECT p.*, s.port_type
       FROM players p
       JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
       WHERE p.user_id = $1
       FOR UPDATE`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      throw new Error('Player not found');
    }

    const player = playerResult.rows[0];

    // Check if at StarDock
    if (player.port_type !== 'STARDOCK') {
      throw new Error('You must be at a StarDock to purchase ships');
    }

    // Get ship info
    const shipResult = await client.query(
      `SELECT * FROM ship_types 
       WHERE LOWER(name) = LOWER($1) 
       AND (universe_id IS NULL OR universe_id = $2)
       LIMIT 1`,
      [shipName, player.universe_id]
    );

    if (shipResult.rows.length === 0) {
      throw new Error('Ship type not found');
    }

    const ship = shipResult.rows[0];
    const cost = parseInt(ship.cost_credits) || 0;

    // Check if already owns this ship
    if (player.ship_type?.toLowerCase() === ship.name?.toLowerCase()) {
      throw new Error('You already own this ship');
    }

    // Check credits
    if (parseInt(player.credits) < cost) {
      throw new Error(`Not enough credits. Need ${cost.toLocaleString()}, have ${parseInt(player.credits).toLocaleString()}`);
    }

    // Calculate cargo to keep (limited by new ship's holds)
    const currentCargo = player.cargo_fuel + player.cargo_organics + player.cargo_equipment;
    const newHolds = ship.holds;
    
    let newFuel = player.cargo_fuel;
    let newOrganics = player.cargo_organics;
    let newEquipment = player.cargo_equipment;
    
    // If cargo exceeds new ship capacity, reduce proportionally
    if (currentCargo > newHolds) {
      const ratio = newHolds / currentCargo;
      newFuel = Math.floor(player.cargo_fuel * ratio);
      newOrganics = Math.floor(player.cargo_organics * ratio);
      newEquipment = Math.floor(player.cargo_equipment * ratio);
    }

    // Fighters and shields transfer (limited by new ship's max)
    const newFighters = Math.min(player.ship_fighters || 0, ship.fighters_max || ship.fighters || 0);
    const newShields = Math.min(player.ship_shields || 0, ship.shields_max || ship.shields || 0);

    // Update player
    await client.query(
      `UPDATE players SET
        credits = credits - $1,
        ship_type = $2,
        ship_holds_max = $3,
        ship_fighters = $4,
        ship_shields = $5,
        cargo_fuel = $6,
        cargo_organics = $7,
        cargo_equipment = $8
       WHERE id = $9`,
      [cost, ship.name, ship.holds, newFighters, newShields, newFuel, newOrganics, newEquipment, player.id]
    );

    // Get updated player
    const updatedResult = await client.query(
      'SELECT credits, ship_type, ship_holds_max, ship_fighters, ship_shields FROM players WHERE id = $1',
      [player.id]
    );

    await client.query('COMMIT');

    const updated = updatedResult.rows[0];
    const cargoLost = currentCargo - (newFuel + newOrganics + newEquipment);
    const fightersLost = (player.ship_fighters || 0) - newFighters;
    const shieldsLost = (player.ship_shields || 0) - newShields;

    let message = `Purchased ${ship.display_name || ship.name} for ${cost.toLocaleString()} credits!`;
    if (cargoLost > 0 || fightersLost > 0 || shieldsLost > 0) {
      message += ` (Lost: ${cargoLost > 0 ? `${cargoLost} cargo` : ''}${fightersLost > 0 ? `, ${fightersLost} fighters` : ''}${shieldsLost > 0 ? `, ${shieldsLost} shields` : ''})`;
    }

    return {
      success: true,
      message,
      player: {
        credits: parseInt(updated.credits),
        shipType: updated.ship_type,
        shipHoldsMax: updated.ship_holds_max,
        fighters: updated.ship_fighters,
        shields: updated.ship_shields,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Purchase fighters at StarDock
 */
export async function purchaseFighters(userId: number, quantity: number): Promise<PurchaseResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get player info
    const playerResult = await client.query(
      `SELECT p.*, s.port_type, st.fighters_max
       FROM players p
       JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
       LEFT JOIN ship_types st ON LOWER(st.name) = LOWER(p.ship_type) AND (st.universe_id IS NULL OR st.universe_id = p.universe_id)
       WHERE p.user_id = $1
       FOR UPDATE`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      throw new Error('Player not found');
    }

    const player = playerResult.rows[0];

    // Check if at StarDock
    if (player.port_type !== 'STARDOCK') {
      throw new Error('You must be at a StarDock to purchase fighters');
    }

    const currentFighters = player.ship_fighters || 0;
    const maxFighters = player.fighters_max || 0;
    const availableSpace = maxFighters - currentFighters;

    if (availableSpace <= 0) {
      throw new Error('Your ship cannot hold any more fighters');
    }

    // Limit quantity to available space
    const actualQuantity = Math.min(quantity, availableSpace);
    const totalCost = actualQuantity * FIGHTER_PRICE;

    if (parseInt(player.credits) < totalCost) {
      throw new Error(`Not enough credits. Need ${totalCost.toLocaleString()}, have ${parseInt(player.credits).toLocaleString()}`);
    }

    // Update player
    await client.query(
      `UPDATE players SET
        credits = credits - $1,
        ship_fighters = ship_fighters + $2
       WHERE id = $3`,
      [totalCost, actualQuantity, player.id]
    );

    // Get updated player
    const updatedResult = await client.query(
      'SELECT credits, ship_fighters FROM players WHERE id = $1',
      [player.id]
    );

    await client.query('COMMIT');

    const updated = updatedResult.rows[0];

    return {
      success: true,
      message: `Purchased ${actualQuantity} fighters for ${totalCost.toLocaleString()} credits`,
      player: {
        credits: parseInt(updated.credits),
        fighters: updated.ship_fighters,
        fightersMax: maxFighters,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Purchase shields at StarDock
 */
export async function purchaseShields(userId: number, quantity: number): Promise<PurchaseResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get player info
    const playerResult = await client.query(
      `SELECT p.*, s.port_type, st.shields_max
       FROM players p
       JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
       LEFT JOIN ship_types st ON LOWER(st.name) = LOWER(p.ship_type) AND (st.universe_id IS NULL OR st.universe_id = p.universe_id)
       WHERE p.user_id = $1
       FOR UPDATE`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      throw new Error('Player not found');
    }

    const player = playerResult.rows[0];

    // Check if at StarDock
    if (player.port_type !== 'STARDOCK') {
      throw new Error('You must be at a StarDock to purchase shields');
    }

    const currentShields = player.ship_shields || 0;
    const maxShields = player.shields_max || 0;
    const availableSpace = maxShields - currentShields;

    if (availableSpace <= 0) {
      throw new Error('Your ship cannot hold any more shields');
    }

    // Limit quantity to available space
    const actualQuantity = Math.min(quantity, availableSpace);
    const totalCost = actualQuantity * SHIELD_PRICE;

    if (parseInt(player.credits) < totalCost) {
      throw new Error(`Not enough credits. Need ${totalCost.toLocaleString()}, have ${parseInt(player.credits).toLocaleString()}`);
    }

    // Update player
    await client.query(
      `UPDATE players SET
        credits = credits - $1,
        ship_shields = ship_shields + $2
       WHERE id = $3`,
      [totalCost, actualQuantity, player.id]
    );

    // Get updated player
    const updatedResult = await client.query(
      'SELECT credits, ship_shields FROM players WHERE id = $1',
      [player.id]
    );

    await client.query('COMMIT');

    const updated = updatedResult.rows[0];

    return {
      success: true,
      message: `Purchased ${actualQuantity} shields for ${totalCost.toLocaleString()} credits`,
      player: {
        credits: parseInt(updated.credits),
        shields: updated.ship_shields,
        shieldsMax: maxShields,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

