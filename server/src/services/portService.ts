import { pool } from '../db/connection';

// Base prices for commodities
const BASE_PRICES = {
  fuel: 10,
  organics: 20,
  equipment: 30,
};

// Port type definitions: S = Sells to players, B = Buys from players
// Format: [fuel, organics, equipment]
const PORT_TYPES: Record<string, { fuel: 'S' | 'B'; organics: 'S' | 'B'; equipment: 'S' | 'B' }> = {
  BBS: { fuel: 'B', organics: 'B', equipment: 'S' },
  BSB: { fuel: 'B', organics: 'S', equipment: 'B' },
  SBB: { fuel: 'S', organics: 'B', equipment: 'B' },
  SSB: { fuel: 'S', organics: 'S', equipment: 'B' },
  SBS: { fuel: 'S', organics: 'B', equipment: 'S' },
  BSS: { fuel: 'B', organics: 'S', equipment: 'S' },
  SSS: { fuel: 'S', organics: 'S', equipment: 'S' },
  BBB: { fuel: 'B', organics: 'B', equipment: 'B' },
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

  // Calculate prices based on port percentage (higher % = higher price)
  // When port sells (S), player buys at higher price
  // When port buys (B), player sells at lower price (port gets discount)
  const calculatePrice = (commodity: 'fuel' | 'organics' | 'equipment', action: 'S' | 'B') => {
    const basePrice = BASE_PRICES[commodity];
    const pctKey = `port_${commodity}_pct` as keyof typeof sector;
    const pct = sector[pctKey] || 100;
    
    if (action === 'S') {
      // Port sells, player buys - price goes up with percentage
      return Math.round(basePrice * (pct / 100) * 1.2);
    } else {
      // Port buys, player sells - price is lower (port pays less)
      return Math.round(basePrice * (pct / 100) * 0.8);
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

    // Calculate price
    const basePrice = BASE_PRICES[commodity];
    const pctKey = `port_${commodity}_pct` as keyof typeof player;
    const pct = player[pctKey] || 100;

    let pricePerUnit: number;
    if (action === 'buy') {
      // Player buys from port - higher price
      pricePerUnit = Math.round(basePrice * (pct / 100) * 1.2);
    } else {
      // Player sells to port - lower price
      pricePerUnit = Math.round(basePrice * (pct / 100) * 0.8);
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

