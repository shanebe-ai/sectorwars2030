import { pool } from '../db/connection';

// Base prices for commodities (mid-point prices)
const BASE_PRICES = {
  fuel: 20,      // Range: ~10-35
  organics: 35,  // Range: ~18-60
  equipment: 55, // Range: ~28-95
};

// Price multipliers for port actions
// When port SELLS (S) = they have excess = LOW price for player to buy
// When port BUYS (B) = they need it = HIGH price for player to sell
const PRICE_MULTIPLIERS = {
  SELL_TO_PLAYER: 0.5,  // Port sells cheap (player buys low)
  BUY_FROM_PLAYER: 1.7, // Port buys high (player sells high)
};

// Special multipliers for rare port types (SSS and BBB)
const RARE_PORT_BONUS = 1.3; // 30% better prices at rare ports

// Port type definitions: S = Sells to players, B = Buys from players
// Format: [fuel, organics, equipment]
const PORT_TYPES: Record<string, { fuel: 'S' | 'B'; organics: 'S' | 'B'; equipment: 'S' | 'B' }> = {
  BBS: { fuel: 'B', organics: 'B', equipment: 'S' },
  BSB: { fuel: 'B', organics: 'S', equipment: 'B' },
  SBB: { fuel: 'S', organics: 'B', equipment: 'B' },
  SSB: { fuel: 'S', organics: 'S', equipment: 'B' },
  SBS: { fuel: 'S', organics: 'B', equipment: 'S' },
  BSS: { fuel: 'B', organics: 'S', equipment: 'S' },
  SSS: { fuel: 'S', organics: 'S', equipment: 'S' }, // Rare - sells all cheap
  BBB: { fuel: 'B', organics: 'B', equipment: 'B' }, // Rare - buys all high
};

export interface PortInfo {
  sectorNumber: number;
  portType: string;
  portClass: number;
  commodities: {
    fuel: { action: 'buy' | 'sell'; quantity: number; price: number };
    organics: { action: 'buy' | 'sell'; quantity: number; price: number };
    equipment: { action: 'buy' | 'sell'; quantity: number; price: number };
  };
}

export interface TradeResult {
  success: boolean;
  commodity: string;
  action: 'buy' | 'sell';
  quantity: number;
  totalCost: number;
  player: {
    credits: number;
    cargoFuel: number;
    cargoOrganics: number;
    cargoEquipment: number;
    turnsRemaining: number;
    cargoUsed: number;
    cargoMax: number;
  };
  portQuantityRemaining: number;
}

/**
 * Get port information for a sector including prices and available quantities
 */
export const getPortInfo = async (
  userId: number,
  sectorNumber: number
): Promise<PortInfo | null> => {
  // Get player's universe
  const playerResult = await pool.query(
    'SELECT universe_id FROM players WHERE user_id = $1',
    [userId]
  );

  if (playerResult.rows.length === 0) {
    throw new Error('Player not found');
  }

  const universeId = playerResult.rows[0].universe_id;

  // Get sector with port data
  const sectorResult = await pool.query(
    `SELECT
      sector_number,
      port_type,
      port_class,
      port_fuel_qty,
      port_organics_qty,
      port_equipment_qty,
      port_fuel_pct,
      port_organics_pct,
      port_equipment_pct
    FROM sectors
    WHERE universe_id = $1 AND sector_number = $2`,
    [universeId, sectorNumber]
  );

  if (sectorResult.rows.length === 0) {
    throw new Error('Sector not found');
  }

  const sector = sectorResult.rows[0];

  if (!sector.port_type) {
    return null; // No port in this sector
  }

  const portConfig = PORT_TYPES[sector.port_type];
  if (!portConfig) {
    throw new Error('Invalid port type');
  }

  // Calculate prices based on port type and stock percentage
  // S = Port SELLS to player (cheap - they have excess)
  // B = Port BUYS from player (expensive - they need it)
  // Stock percentage affects price: low stock = higher prices
  const calculatePrice = (commodity: 'fuel' | 'organics' | 'equipment', action: 'S' | 'B') => {
    const basePrice = BASE_PRICES[commodity];
    const pctKey = `port_${commodity}_pct` as keyof typeof sector;
    const stockPct = sector[pctKey] || 100;
    
    // Stock affects price: low stock (high pct) = higher prices
    // pct represents "demand" - 100% = normal, 150% = high demand, 50% = low demand
    const stockMultiplier = stockPct / 100;
    
    // Check if this is a rare port type (SSS or BBB)
    const isRarePort = sector.port_type === 'SSS' || sector.port_type === 'BBB';
    const rareBonus = isRarePort ? RARE_PORT_BONUS : 1.0;
    
    if (action === 'S') {
      // Port SELLS to player = player BUYS at LOW price
      // Lower stock = slightly higher buy price
      const price = basePrice * PRICE_MULTIPLIERS.SELL_TO_PLAYER * stockMultiplier;
      // SSS sells even cheaper (better for player)
      return Math.round(price / rareBonus);
    } else {
      // Port BUYS from player = player SELLS at HIGH price
      // Higher stock demand (high pct) = even higher sell price
      const price = basePrice * PRICE_MULTIPLIERS.BUY_FROM_PLAYER * stockMultiplier;
      // BBB buys even higher (better for player)
      return Math.round(price * rareBonus);
    }
  };

  return {
    sectorNumber: sector.sector_number,
    portType: sector.port_type,
    portClass: sector.port_class || 1,
    commodities: {
      fuel: {
        action: portConfig.fuel === 'S' ? 'buy' : 'sell',
        quantity: sector.port_fuel_qty || 0,
        price: calculatePrice('fuel', portConfig.fuel),
      },
      organics: {
        action: portConfig.organics === 'S' ? 'buy' : 'sell',
        quantity: sector.port_organics_qty || 0,
        price: calculatePrice('organics', portConfig.organics),
      },
      equipment: {
        action: portConfig.equipment === 'S' ? 'buy' : 'sell',
        quantity: sector.port_equipment_qty || 0,
        price: calculatePrice('equipment', portConfig.equipment),
      },
    },
  };
};

/**
 * Execute a trade at a port
 * @param userId - The user ID
 * @param commodity - 'fuel', 'organics', or 'equipment'
 * @param action - 'buy' (player buys from port) or 'sell' (player sells to port)
 * @param quantity - Amount to trade
 */
export const executeTrade = async (
  userId: number,
  commodity: 'fuel' | 'organics' | 'equipment',
  action: 'buy' | 'sell',
  quantity: number
): Promise<TradeResult> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get player details
    const playerResult = await client.query(
      `SELECT
        p.id,
        p.universe_id,
        p.current_sector,
        p.credits,
        p.turns_remaining,
        p.ship_holds_max,
        p.cargo_fuel,
        p.cargo_organics,
        p.cargo_equipment,
        s.id as sector_id,
        s.port_type,
        s.port_class,
        s.port_fuel_qty,
        s.port_organics_qty,
        s.port_equipment_qty,
        s.port_fuel_pct,
        s.port_organics_pct,
        s.port_equipment_pct
      FROM players p
      JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
      WHERE p.user_id = $1`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      throw new Error('Player not found');
    }

    const player = playerResult.rows[0];

    // Check if player has turns
    if (player.turns_remaining <= 0) {
      throw new Error('Not enough turns remaining');
    }

    // Check if sector has a port
    if (!player.port_type) {
      throw new Error('No port in this sector');
    }

    const portConfig = PORT_TYPES[player.port_type];
    if (!portConfig) {
      throw new Error('Invalid port type');
    }

    // Verify the trade action is valid for this port
    const portAction = portConfig[commodity]; // 'S' or 'B'
    const expectedPlayerAction = portAction === 'S' ? 'buy' : 'sell';
    
    if (action !== expectedPlayerAction) {
      throw new Error(`This port does not ${action} ${commodity}`);
    }

    // Calculate current cargo usage
    const currentCargo = player.cargo_fuel + player.cargo_organics + player.cargo_equipment;
    const cargoSpace = player.ship_holds_max - currentCargo;

    // Get port quantity for this commodity
    const portQtyKey = `port_${commodity}_qty` as keyof typeof player;
    const portQuantity = player[portQtyKey] || 0;

    // Get current player cargo for this commodity
    const cargoKey = `cargo_${commodity}` as keyof typeof player;
    const playerCargo = player[cargoKey] || 0;

    // Calculate price using the same formula as getPortInfo
    const basePrice = BASE_PRICES[commodity];
    const pctKey = `port_${commodity}_pct` as keyof typeof player;
    const stockPct = player[pctKey] || 100;
    const stockMultiplier = stockPct / 100;
    
    // Check if this is a rare port type
    const isRarePort = player.port_type === 'SSS' || player.port_type === 'BBB';
    const rareBonus = isRarePort ? RARE_PORT_BONUS : 1.0;

    let pricePerUnit: number;
    if (action === 'buy') {
      // Player BUYS from port (port SELLS) = LOW price
      const price = basePrice * PRICE_MULTIPLIERS.SELL_TO_PLAYER * stockMultiplier;
      pricePerUnit = Math.round(price / rareBonus);
    } else {
      // Player SELLS to port (port BUYS) = HIGH price
      const price = basePrice * PRICE_MULTIPLIERS.BUY_FROM_PLAYER * stockMultiplier;
      pricePerUnit = Math.round(price * rareBonus);
    }

    let actualQuantity = quantity;
    let totalCost: number;

    if (action === 'buy') {
      // Player is buying from port
      // Limit by: cargo space, port quantity, credits
      actualQuantity = Math.min(actualQuantity, cargoSpace);
      actualQuantity = Math.min(actualQuantity, portQuantity);
      
      totalCost = actualQuantity * pricePerUnit;
      if (totalCost > player.credits) {
        actualQuantity = Math.floor(player.credits / pricePerUnit);
        totalCost = actualQuantity * pricePerUnit;
      }

      if (actualQuantity <= 0) {
        throw new Error('Cannot complete trade: insufficient credits, cargo space, or port stock');
      }

      // Update player: add cargo, subtract credits and turns
      await client.query(
        `UPDATE players SET
          cargo_${commodity} = cargo_${commodity} + $1,
          credits = credits - $2,
          turns_remaining = turns_remaining - 1
        WHERE id = $3`,
        [actualQuantity, totalCost, player.id]
      );

      // Update port: subtract quantity
      await client.query(
        `UPDATE sectors SET
          port_${commodity}_qty = port_${commodity}_qty - $1
        WHERE id = $2`,
        [actualQuantity, player.sector_id]
      );

    } else {
      // Player is selling to port
      // Limit by: player cargo
      actualQuantity = Math.min(actualQuantity, playerCargo);

      if (actualQuantity <= 0) {
        throw new Error('You do not have any ' + commodity + ' to sell');
      }

      totalCost = actualQuantity * pricePerUnit;

      // Update player: subtract cargo, add credits, subtract turn
      await client.query(
        `UPDATE players SET
          cargo_${commodity} = cargo_${commodity} - $1,
          credits = credits + $2,
          turns_remaining = turns_remaining - 1
        WHERE id = $3`,
        [actualQuantity, totalCost, player.id]
      );

      // Update port: add quantity
      await client.query(
        `UPDATE sectors SET
          port_${commodity}_qty = port_${commodity}_qty + $1
        WHERE id = $2`,
        [actualQuantity, player.sector_id]
      );
    }

    // Log the trade event
    await client.query(
      `INSERT INTO game_events (universe_id, player_id, event_type, event_data, sector_number)
       VALUES ($1, $2, 'trade', $3, $4)`,
      [
        player.universe_id,
        player.id,
        JSON.stringify({
          commodity,
          action,
          quantity: actualQuantity,
          pricePerUnit,
          totalCost,
          portType: player.port_type,
        }),
        player.current_sector,
      ]
    );

    // Get updated player and port data
    const updatedPlayerResult = await client.query(
      `SELECT
        credits,
        turns_remaining,
        cargo_fuel,
        cargo_organics,
        cargo_equipment,
        ship_holds_max
      FROM players WHERE id = $1`,
      [player.id]
    );

    const updatedPortResult = await client.query(
      `SELECT port_${commodity}_qty as qty FROM sectors WHERE id = $1`,
      [player.sector_id]
    );

    await client.query('COMMIT');

    const updatedPlayer = updatedPlayerResult.rows[0];
    const newCargoTotal = updatedPlayer.cargo_fuel + updatedPlayer.cargo_organics + updatedPlayer.cargo_equipment;

    return {
      success: true,
      commodity,
      action,
      quantity: actualQuantity,
      totalCost,
      player: {
        credits: parseInt(updatedPlayer.credits),
        cargoFuel: updatedPlayer.cargo_fuel,
        cargoOrganics: updatedPlayer.cargo_organics,
        cargoEquipment: updatedPlayer.cargo_equipment,
        turnsRemaining: updatedPlayer.turns_remaining,
        shipHoldsMax: updatedPlayer.ship_holds_max,
        cargoUsed: newCargoTotal,
        cargoMax: updatedPlayer.ship_holds_max,
      },
      portQuantityRemaining: updatedPortResult.rows[0].qty,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Colonist trading configuration
const COLONIST_PRICE = 100;       // Credits per colonist
const MAX_COLONIST_PURCHASE = 1000; // Max colonists per transaction

/**
 * Buy colonists at a port
 * Colonists can be bought at any port (not StarDocks)
 * They use cargo space like other commodities
 */
export const buyColonists = async (
  userId: number,
  quantity: number
): Promise<{ success: boolean; quantity: number; totalCost: number; error?: string; player?: any }> => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get player details
    const playerResult = await client.query(
      `SELECT
        p.id,
        p.universe_id,
        p.current_sector,
        p.credits,
        p.turns_remaining,
        p.ship_holds_max,
        p.cargo_fuel,
        p.cargo_organics,
        p.cargo_equipment,
        p.colonists,
        s.port_type
      FROM players p
      JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
      WHERE p.user_id = $1`,
      [userId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, quantity: 0, totalCost: 0, error: 'Player not found' };
    }

    const player = playerResult.rows[0];

    // Check if sector has a port (not StarDock)
    if (!player.port_type || player.port_type === 'STARDOCK') {
      await client.query('ROLLBACK');
      return { success: false, quantity: 0, totalCost: 0, error: 'Colonists can only be purchased at trading ports' };
    }

    // Check turns
    if (player.turns_remaining <= 0) {
      await client.query('ROLLBACK');
      return { success: false, quantity: 0, totalCost: 0, error: 'Not enough turns remaining' };
    }

    // Calculate current cargo usage (colonists use cargo space)
    const currentCargo = player.cargo_fuel + player.cargo_organics + player.cargo_equipment + player.colonists;
    const cargoSpace = player.ship_holds_max - currentCargo;

    // Limit quantity
    let actualQuantity = Math.min(quantity, MAX_COLONIST_PURCHASE);
    actualQuantity = Math.min(actualQuantity, cargoSpace);

    const totalCost = actualQuantity * COLONIST_PRICE;

    if (totalCost > player.credits) {
      actualQuantity = Math.floor(player.credits / COLONIST_PRICE);
      if (actualQuantity <= 0) {
        await client.query('ROLLBACK');
        return { success: false, quantity: 0, totalCost: 0, error: 'Insufficient credits' };
      }
    }

    if (actualQuantity <= 0) {
      await client.query('ROLLBACK');
      return { success: false, quantity: 0, totalCost: 0, error: 'No cargo space available' };
    }

    const finalCost = actualQuantity * COLONIST_PRICE;

    // Update player
    await client.query(
      `UPDATE players SET
        colonists = colonists + $1,
        credits = credits - $2,
        turns_remaining = turns_remaining - 1
      WHERE id = $3`,
      [actualQuantity, finalCost, player.id]
    );

    // Log the event
    await client.query(
      `INSERT INTO game_events (universe_id, player_id, event_type, event_data, sector_number)
       VALUES ($1, $2, 'colonist_purchase', $3, $4)`,
      [
        player.universe_id,
        player.id,
        JSON.stringify({
          quantity: actualQuantity,
          pricePerUnit: COLONIST_PRICE,
          totalCost: finalCost,
        }),
        player.current_sector,
      ]
    );

    // Get updated player data
    const updatedPlayerResult = await client.query(
      `SELECT id, credits, turns_remaining, cargo_fuel, cargo_organics, cargo_equipment, colonists, ship_holds_max
       FROM players WHERE id = $1`,
      [player.id]
    );

    await client.query('COMMIT');

    const updatedPlayer = updatedPlayerResult.rows[0];
    return { 
      success: true, 
      quantity: actualQuantity, 
      totalCost: finalCost,
      player: {
        credits: updatedPlayer.credits,
        turnsRemaining: updatedPlayer.turns_remaining,
        cargoFuel: updatedPlayer.cargo_fuel,
        cargoOrganics: updatedPlayer.cargo_organics,
        cargoEquipment: updatedPlayer.cargo_equipment,
        colonists: updatedPlayer.colonists,
        shipHoldsMax: updatedPlayer.ship_holds_max
      }
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error buying colonists:', error);
    return { success: false, quantity: 0, totalCost: 0, error: 'Failed to purchase colonists' };
  } finally {
    client.release();
  }
};

/**
 * Get colonist info for a port
 */
export const getColonistInfo = async (
  userId: number
): Promise<{ available: boolean; price: number; maxPurchase: number; playerColonists: number; cargoSpace: number }> => {
  const result = await pool.query(
    `SELECT
      p.colonists,
      p.ship_holds_max,
      p.cargo_fuel,
      p.cargo_organics,
      p.cargo_equipment,
      s.port_type
    FROM players p
    JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
    WHERE p.user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return { available: false, price: COLONIST_PRICE, maxPurchase: 0, playerColonists: 0, cargoSpace: 0 };
  }

  const player = result.rows[0];
  const currentCargo = player.cargo_fuel + player.cargo_organics + player.cargo_equipment + player.colonists;
  const cargoSpace = player.ship_holds_max - currentCargo;
  const available = player.port_type && player.port_type !== 'STARDOCK';

  return {
    available,
    price: COLONIST_PRICE,
    maxPurchase: Math.min(MAX_COLONIST_PURCHASE, cargoSpace),
    playerColonists: player.colonists || 0,
    cargoSpace
  };
};

// Port regeneration configuration
const PORT_REGEN_BASE = 500;      // Base units regenerated per cycle
const PORT_REGEN_MAX = 15000;     // Maximum port stock
const PORT_REGEN_MIN = 1000;      // Minimum port stock (always regenerate to this)

/**
 * Regenerate port stock across all universes
 * Should be called periodically (e.g., every hour or on game tick)
 * Ports regenerate stock over time, simulating production/consumption
 */
export const regeneratePorts = async (): Promise<{ portsUpdated: number }> => {
  const client = await pool.connect();

  try {
    // Regenerate all ports (excluding StarDocks which have unlimited supply)
    const result = await client.query(`
      UPDATE sectors
      SET
        port_fuel_qty = LEAST($2, GREATEST($3, port_fuel_qty + $1)),
        port_organics_qty = LEAST($2, GREATEST($3, port_organics_qty + $1)),
        port_equipment_qty = LEAST($2, GREATEST($3, port_equipment_qty + $1))
      WHERE port_type IS NOT NULL 
        AND port_type != 'STARDOCK'
      RETURNING id
    `, [PORT_REGEN_BASE, PORT_REGEN_MAX, PORT_REGEN_MIN]);

    console.log(`[Port Regen] Regenerated ${result.rowCount} ports (+${PORT_REGEN_BASE} units each)`);

    return { portsUpdated: result.rowCount || 0 };
  } finally {
    client.release();
  }
};

/**
 * Start automatic port regeneration (runs every hour)
 */
export const startPortRegeneration = (intervalMs: number = 3600000): NodeJS.Timeout => {
  console.log(`[Port Regen] Starting automatic port regeneration every ${intervalMs / 60000} minutes`);
  
  // Run immediately once
  regeneratePorts().catch(console.error);
  
  // Then run on interval
  return setInterval(() => {
    regeneratePorts().catch(console.error);
  }, intervalMs);
};

