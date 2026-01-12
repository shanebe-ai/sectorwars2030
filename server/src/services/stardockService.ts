import { pool } from '../db/connection';
import { emitPlayerEvent } from '../index';

// Fighter and shield prices (balanced so full loadout = ~2-3 trade runs)
const FIGHTER_PRICE = 200;   // 200 credits per fighter
const SHIELD_PRICE = 100;    // 100 credits per shield point

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
  netCost: number;  // Cost after trade-in value
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
  tradeInValue: number;  // Trade-in value of current ship
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
    mines?: number;
    beacons?: number;
    genesis?: number;
  };
}

// Trade-in value is 70% of ship's original cost
const TRADE_IN_PERCENTAGE = 0.70;

/**
 * Get StarDock information including ships for sale
 */
export async function getStardockInfo(userId: number): Promise<StardockInfo | null> {
  // Get player info and current sector, join with ship_types to get ship max stats
  const playerResult = await pool.query(
    `SELECT p.*, s.port_type, s.name as sector_name, s.sector_number,
            st.fighters_max as ship_fighters_max, st.shields_max as ship_shields_max, st.cost_credits as current_ship_cost
     FROM players p
     JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
     LEFT JOIN ship_types st ON LOWER(st.name) = LOWER(p.ship_type) AND (st.universe_id IS NULL OR st.universe_id = p.universe_id)
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

  // Calculate trade-in value from current ship cost (already fetched in main query)
  const currentShipCost = parseInt(player.current_ship_cost) || 0;
  const tradeInValue = Math.floor(currentShipCost * TRADE_IN_PERCENTAGE);

  // Get all ship types (global ones with universe_id = NULL)
  const shipsResult = await pool.query(
    `SELECT * FROM ship_types 
     WHERE universe_id IS NULL OR universe_id = $1
     ORDER BY cost_credits ASC`,
    [player.universe_id]
  );

  const playerCredits = parseInt(player.credits);
  
  const ships: ShipForSale[] = shipsResult.rows.map(ship => {
    const shipCost = parseInt(ship.cost_credits) || 0;
    const netCost = Math.max(0, shipCost - tradeInValue);
    
    return {
      id: ship.id,
      name: ship.name,
      displayName: ship.display_name || ship.name,
      holds: ship.holds,
      fightersMax: ship.fighters_max || ship.fighters || 0,
      shieldsMax: ship.shields_max || ship.shields || 0,
      minesMax: ship.mines_max || 0,
      genesisMax: ship.genesis_max || 0,
      cost: shipCost,
      netCost: netCost,
      description: ship.description || '',
      canAfford: playerCredits >= netCost,
      isCurrentShip: player.ship_type?.toLowerCase() === ship.name?.toLowerCase(),
    };
  });

  return {
    sectorNumber: player.sector_number,
    name: player.sector_name || `StarDock`,
    ships,
    fighterPrice: FIGHTER_PRICE,
    shieldPrice: SHIELD_PRICE,
    tradeInValue,
    player: {
      credits: playerCredits,
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
 * Includes trade-in value for current ship (70% of its cost)
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

    // Get new ship info
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

    const newShip = shipResult.rows[0];
    const newShipCost = parseInt(newShip.cost_credits) || 0;

    // Check if already owns this ship
    if (player.ship_type?.toLowerCase() === newShip.name?.toLowerCase()) {
      throw new Error('You already own this ship');
    }

    // Get current ship's value for trade-in
    let tradeInValue = 0;
    if (player.ship_type) {
      const currentShipResult = await client.query(
        `SELECT cost_credits FROM ship_types 
         WHERE LOWER(name) = LOWER($1) 
         AND (universe_id IS NULL OR universe_id = $2)
         LIMIT 1`,
        [player.ship_type, player.universe_id]
      );
      
      if (currentShipResult.rows.length > 0) {
        const currentShipCost = parseInt(currentShipResult.rows[0].cost_credits) || 0;
        tradeInValue = Math.floor(currentShipCost * TRADE_IN_PERCENTAGE);
      }
    }

    // Calculate net cost (new ship cost minus trade-in value)
    const netCost = Math.max(0, newShipCost - tradeInValue);

    // Check credits
    if (parseInt(player.credits) < netCost) {
      throw new Error(`Not enough credits. Need ${netCost.toLocaleString()} (after ${tradeInValue.toLocaleString()} trade-in), have ${parseInt(player.credits).toLocaleString()}`);
    }

    // Calculate cargo to keep (limited by new ship's holds)
    const currentCargo = player.cargo_fuel + player.cargo_organics + player.cargo_equipment + (player.colonists || 0);
    const newHolds = newShip.holds;
    
    let newFuel = player.cargo_fuel;
    let newOrganics = player.cargo_organics;
    let newEquipment = player.cargo_equipment;
    let newColonists = player.colonists || 0;
    
    // If cargo exceeds new ship capacity, reduce proportionally
    if (currentCargo > newHolds) {
      const ratio = newHolds / currentCargo;
      newFuel = Math.floor(player.cargo_fuel * ratio);
      newOrganics = Math.floor(player.cargo_organics * ratio);
      newEquipment = Math.floor(player.cargo_equipment * ratio);
      newColonists = Math.floor((player.colonists || 0) * ratio);
    }

    // Fighters, shields, mines, beacons, and genesis transfer (capped by new ship)
    const newFighters = Math.min(player.ship_fighters || 0, newShip.fighters_max || 0);
    const newShields = Math.min(player.ship_shields || 0, newShip.shields_max || 0);
    const newMines = Math.min(player.ship_mines || 0, newShip.mines_max || 0);
    const newBeacons = Math.min(player.ship_beacons || 0, newShip.beacons_max || 0);
    const newGenesis = Math.min(player.ship_genesis || 0, newShip.genesis_max || 0);

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
        cargo_equipment = $8,
        colonists = $9,
        ship_mines = $10,
        ship_beacons = $11,
        ship_genesis = $12,
        in_escape_pod = FALSE
       WHERE id = $13`,
      [
        netCost,
        newShip.name,
        newShip.holds,
        newFighters,
        newShields,
        newFuel,
        newOrganics,
        newEquipment,
        newColonists,
        newMines,
        newBeacons,
        newGenesis,
        player.id
      ]
    );

    // Get updated player
    const updatedResult = await client.query(
      `SELECT credits, ship_type, ship_holds_max, ship_fighters, ship_shields,
              ship_mines, ship_beacons, ship_genesis,
              cargo_fuel, cargo_organics, cargo_equipment, colonists
       FROM players WHERE id = $1`,
      [player.id]
    );

    await client.query('COMMIT');

    const updated = updatedResult.rows[0];
    const cargoLost = currentCargo - (newFuel + newOrganics + newEquipment + newColonists);
    const fightersLost = (player.ship_fighters || 0) - newFighters;
    const shieldsLost = (player.ship_shields || 0) - newShields;

    // Emit WebSocket event for ship purchase
    emitPlayerEvent(player.id, 'ship_purchased', {
      oldShipType: player.ship_type,
      newShipType: newShip.name,
      netCost
    });

    let message = `Traded in your ship for ${tradeInValue.toLocaleString()} credits and purchased ${newShip.name} for ${newShipCost.toLocaleString()} credits (net cost: ${netCost.toLocaleString()})!`;
    if (cargoLost > 0 || fightersLost > 0 || shieldsLost > 0) {
      const losses = [];
      if (cargoLost > 0) losses.push(`${cargoLost} cargo`);
      if (fightersLost > 0) losses.push(`${fightersLost} fighters`);
      if (shieldsLost > 0) losses.push(`${shieldsLost} shields`);
      message += ` Lost: ${losses.join(', ')}`;
    }

    return {
      success: true,
      message,
      player: {
        credits: parseInt(updated.credits),
        shipType: updated.ship_type,
        shipHoldsMax: updated.ship_holds_max,
        fighters: updated.ship_fighters,
        fightersMax: newShip.fighters_max,
        shields: updated.ship_shields,
        shieldsMax: newShip.shields_max,
        mines: updated.ship_mines,
        beacons: updated.ship_beacons,
        genesis: updated.ship_genesis,
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

    // Get player info and lock player row
    const playerResult = await client.query(
      `SELECT p.*, s.port_type
       FROM players p
       JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
       WHERE p.user_id = $1
       FOR UPDATE OF p`,
      [userId]
    );
    
    if (playerResult.rows.length === 0) {
      throw new Error('Player not found');
    }

    const player = playerResult.rows[0];
    
    // Get ship max fighters separately (no lock needed on ship_types)
    const shipResult = await client.query(
      `SELECT fighters_max FROM ship_types 
       WHERE LOWER(name) = LOWER($1) AND (universe_id IS NULL OR universe_id = $2)
       LIMIT 1`,
      [player.ship_type, player.universe_id]
    );
    
    const maxFighters = shipResult.rows[0]?.fighters_max || 0;

    // Check if at StarDock
    if (player.port_type !== 'STARDOCK') {
      throw new Error('You must be at a StarDock to purchase fighters');
    }

    const currentFighters = player.ship_fighters || 0;
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

    // Get player info and lock player row
    const playerResult = await client.query(
      `SELECT p.*, s.port_type
       FROM players p
       JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
       WHERE p.user_id = $1
       FOR UPDATE OF p`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      throw new Error('Player not found');
    }

    const player = playerResult.rows[0];

    // Get ship max shields separately (no lock needed on ship_types)
    const shipResult = await client.query(
      `SELECT shields_max FROM ship_types 
       WHERE LOWER(name) = LOWER($1) AND (universe_id IS NULL OR universe_id = $2)
       LIMIT 1`,
      [player.ship_type, player.universe_id]
    );
    
    const maxShields = shipResult.rows[0]?.shields_max || 0;

    // Check if at StarDock
    if (player.port_type !== 'STARDOCK') {
      throw new Error('You must be at a StarDock to purchase shields');
    }

    const currentShields = player.ship_shields || 0;
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

