/**
 * Alien Trading Service
 * Handles all trading interactions between players and alien ships
 * Includes pricing, offer generation, trade execution, and robbery mechanics
 */

import { pool } from '../db/connection';
import { AlienTradeOffer, AlienTradeHistory } from '../../../shared/types';

// Import emitPlayerEvent for WebSocket notifications
let emitPlayerEvent: ((playerId: number, event: string, data: any) => void) | null = null;

// Lazy load to avoid circular dependency
const getEmitPlayerEvent = async () => {
  if (!emitPlayerEvent) {
    const indexModule = await import('../index');
    emitPlayerEvent = indexModule.emitPlayerEvent;
  }
  return emitPlayerEvent;
};

// Base prices from port service (for reference)
const BASE_PRICES = {
  fuel: 20,
  organics: 35,
  equipment: 55,
};

// Alien trade pricing constants
// Aliens are less favorable than ports but more convenient (they move around)
const ALIEN_PRICE_MULTIPLIERS = {
  ALIEN_SELLS_TO_PLAYER: 0.6,  // Aliens sell at 60-80% of base (ports: 50%)
  ALIEN_BUYS_FROM_PLAYER: 1.4, // Aliens buy at 140-120% of base (ports: 170%)
};

// Alignment affects pricing: friendlier aliens = better prices
// Alignment range: 50 (neutral) to 150 (very friendly)
// Modifier range: 0.9 (friendly discount) to 1.1 (neutral markup)
const calculateAlignmentModifier = (alignment: number): number => {
  // Linear interpolation: alignment 150 = 0.9x, alignment 50 = 1.1x
  const normalized = (alignment - 50) / 100; // Range: 0 to 1
  const modifier = 1.1 - (normalized * 0.2); // Range: 1.1 to 0.9
  return Math.max(0.9, Math.min(1.1, modifier));
};

// Robbery constants
const ROBBERY_SUCCESS_CHANCE = 0.20; // 20% chance of success
const ROBBERY_COMBAT_PENALTY = 0.20; // -20% combat effectiveness for robber

// Trade offer expiry time
const TRADE_OFFER_EXPIRY_MINUTES = 5;

/**
 * Generate a trade offer from an alien ship to a player
 * This is called when a player encounters a trade-behavior alien
 */
export async function generateTradeOffer(
  alienShipId: number,
  playerId: number,
  client = pool
): Promise<AlienTradeOffer | null> {
  try {
    // Get alien ship data
    const alienResult = await client.query(
      `SELECT
        a.id, a.universe_id, a.alien_race, a.ship_type, a.sector_number,
        a.fighters, a.shields, a.cargo_fuel, a.cargo_organics, a.cargo_equipment,
        a.alignment, a.credits
      FROM alien_ships a
      WHERE a.id = $1 AND a.behavior = 'trade'`,
      [alienShipId]
    );

    if (alienResult.rows.length === 0) {
      return null; // Not a trade alien
    }

    const alien = alienResult.rows[0];

    // Check if alien has any cargo to trade
    if (alien.cargo_fuel === 0 && alien.cargo_organics === 0 && alien.cargo_equipment === 0) {
      return null; // Nothing to trade
    }

    // Check for existing pending offer
    const existingOffer = await client.query(
      `SELECT id FROM alien_trade_offers
       WHERE alien_ship_id = $1 AND player_id = $2
       AND status = 'pending' AND expires_at > NOW()`,
      [alienShipId, playerId]
    );

    if (existingOffer.rows.length > 0) {
      // Already have a pending offer
      return getTradeOfferById(existingOffer.rows[0].id, client);
    }

    // Calculate alignment-based price modifier
    const priceModifier = calculateAlignmentModifier(alien.alignment);

    // Generate trade offer: Alien wants to sell some cargo for credits
    // Choose random commodity to offer (weighted by availability)
    const availableCommodities: Array<'fuel' | 'organics' | 'equipment'> = [];
    if (alien.cargo_fuel > 0) availableCommodities.push('fuel');
    if (alien.cargo_organics > 0) availableCommodities.push('organics');
    if (alien.cargo_equipment > 0) availableCommodities.push('equipment');

    if (availableCommodities.length === 0) {
      return null;
    }

    // Random commodity
    const commodity = availableCommodities[Math.floor(Math.random() * availableCommodities.length)];

    // Offer 10-30% of available cargo
    const cargoField = `cargo_${commodity}` as 'cargo_fuel' | 'cargo_organics' | 'cargo_equipment';
    const availableAmount = alien[cargoField];
    const offerAmount = Math.min(
      Math.floor(availableAmount * (0.1 + Math.random() * 0.2)),
      1000 // Cap at 1000 units
    );

    if (offerAmount === 0) {
      return null;
    }

    // Calculate price: alien SELLS to player (player pays credits)
    const basePrice = BASE_PRICES[commodity];
    const pricePerUnit = Math.round(
      basePrice * ALIEN_PRICE_MULTIPLIERS.ALIEN_SELLS_TO_PLAYER * priceModifier
    );
    const totalCredits = pricePerUnit * offerAmount;

    // Create trade offer
    const offerData: any = {
      alienOffersFuel: commodity === 'fuel' ? offerAmount : 0,
      alienOffersOrganics: commodity === 'organics' ? offerAmount : 0,
      alienOffersEquipment: commodity === 'equipment' ? offerAmount : 0,
      alienRequestsCredits: totalCredits,
    };

    const result = await client.query(
      `INSERT INTO alien_trade_offers (
        universe_id, alien_ship_id, player_id,
        alien_offers_fuel, alien_offers_organics, alien_offers_equipment, alien_offers_credits,
        alien_requests_fuel, alien_requests_organics, alien_requests_equipment, alien_requests_credits,
        alien_alignment, price_modifier, status, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW() + INTERVAL '${TRADE_OFFER_EXPIRY_MINUTES} minutes')
      RETURNING *`,
      [
        alien.universe_id,
        alienShipId,
        playerId,
        offerData.alienOffersFuel,
        offerData.alienOffersOrganics,
        offerData.alienOffersEquipment,
        0, // alien_offers_credits (not used for this simple version)
        0, // alien_requests_fuel
        0, // alien_requests_organics
        0, // alien_requests_equipment
        offerData.alienRequestsCredits,
        alien.alignment,
        priceModifier,
        'pending'
      ]
    );

    const offer = mapTradeOfferFromDb(result.rows[0], alien);

    // Emit WebSocket event to notify player
    try {
      const emit = await getEmitPlayerEvent();
      emit(playerId, 'alien_trade_offer', {
        offer,
        message: `${alien.alien_race} trader offers ${offerAmount} ${commodity} for ₡${totalCredits}`
      });
    } catch (wsError) {
      console.error('Error emitting trade offer event:', wsError);
      // Non-fatal
    }

    return offer;
  } catch (error) {
    console.error('Error generating trade offer:', error);
    throw error;
  }
}

/**
 * Get a trade offer by ID with alien ship data
 */
export async function getTradeOfferById(
  offerId: number,
  client = pool
): Promise<AlienTradeOffer | null> {
  try {
    const result = await client.query(
      `SELECT
        ato.*,
        a.alien_race as race, a.ship_name, a.ship_type, a.sector_number, a.alignment,
        a.cargo_fuel, a.cargo_organics, a.cargo_equipment
      FROM alien_trade_offers ato
      JOIN alien_ships a ON ato.alien_ship_id = a.id
      WHERE ato.id = $1`,
      [offerId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return mapTradeOfferFromDb(result.rows[0]);
  } catch (error) {
    console.error('Error getting trade offer:', error);
    throw error;
  }
}

/**
 * Get active trade offers for a player
 */
export async function getPlayerTradeOffers(
  playerId: number,
  client = pool
): Promise<AlienTradeOffer[]> {
  try {
    const result = await client.query(
      `SELECT
        ato.*,
        a.alien_race as race, a.ship_name, a.ship_type, a.sector_number, a.alignment,
        a.cargo_fuel, a.cargo_organics, a.cargo_equipment
      FROM alien_trade_offers ato
      JOIN alien_ships a ON ato.alien_ship_id = a.id
      WHERE ato.player_id = $1
        AND ato.status = 'pending'
        AND ato.expires_at > NOW()
      ORDER BY ato.created_at DESC`,
      [playerId]
    );

    return result.rows.map(row => mapTradeOfferFromDb(row));
  } catch (error) {
    console.error('Error getting player trade offers:', error);
    throw error;
  }
}

/**
 * Accept an alien trade offer
 * Validates resources and executes the trade
 */
export async function acceptAlienTrade(
  offerId: number,
  playerId: number
): Promise<{ success: boolean; message?: string; error?: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get and lock the trade offer
    const offerResult = await client.query(
      `SELECT * FROM alien_trade_offers
       WHERE id = $1 AND player_id = $2
       FOR UPDATE`,
      [offerId, playerId]
    );

    if (offerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Trade offer not found' };
    }

    const offer = offerResult.rows[0];

    // Validate offer status
    if (offer.status !== 'pending') {
      await client.query('ROLLBACK');
      return { success: false, error: 'Trade offer is no longer pending' };
    }

    if (new Date(offer.expires_at) < new Date()) {
      await client.query('UPDATE alien_trade_offers SET status = \'expired\' WHERE id = $1', [offerId]);
      await client.query('ROLLBACK');
      return { success: false, error: 'Trade offer has expired' };
    }

    // Get and lock player
    const playerResult = await client.query(
      `SELECT * FROM players WHERE id = $1 FOR UPDATE`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Player not found' };
    }

    const player = playerResult.rows[0];

    // Validate player has enough credits
    if (player.credits < offer.alien_requests_credits) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: `Insufficient credits. Need ₡${offer.alien_requests_credits}, have ₡${player.credits}`
      };
    }

    // Calculate total cargo player will receive
    const totalCargo = offer.alien_offers_fuel + offer.alien_offers_organics + offer.alien_offers_equipment;
    const currentCargo = player.cargo_fuel + player.cargo_organics + player.cargo_equipment;
    const availableSpace = player.ship_holds_max - currentCargo;

    if (totalCargo > availableSpace) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: `Insufficient cargo space. Need ${totalCargo} holds, have ${availableSpace} available`
      };
    }

    // Get and lock alien ship
    const alienResult = await client.query(
      `SELECT * FROM alien_ships WHERE id = $1 FOR UPDATE`,
      [offer.alien_ship_id]
    );

    if (alienResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Alien ship not found' };
    }

    const alien = alienResult.rows[0];

    // Validate alien still has the cargo
    if (alien.cargo_fuel < offer.alien_offers_fuel ||
        alien.cargo_organics < offer.alien_offers_organics ||
        alien.cargo_equipment < offer.alien_offers_equipment) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Alien no longer has the offered cargo' };
    }

    // Execute trade: Transfer cargo and credits
    await client.query(
      `UPDATE players
       SET credits = credits - $1,
           cargo_fuel = cargo_fuel + $2,
           cargo_organics = cargo_organics + $3,
           cargo_equipment = cargo_equipment + $4
       WHERE id = $5`,
      [
        offer.alien_requests_credits,
        offer.alien_offers_fuel,
        offer.alien_offers_organics,
        offer.alien_offers_equipment,
        playerId
      ]
    );

    await client.query(
      `UPDATE alien_ships
       SET credits = credits + $1,
           cargo_fuel = cargo_fuel - $2,
           cargo_organics = cargo_organics - $3,
           cargo_equipment = cargo_equipment - $4
       WHERE id = $5`,
      [
        offer.alien_requests_credits,
        offer.alien_offers_fuel,
        offer.alien_offers_organics,
        offer.alien_offers_equipment,
        offer.alien_ship_id
      ]
    );

    // Mark offer as accepted
    await client.query(
      `UPDATE alien_trade_offers
       SET status = 'accepted', completed_at = NOW()
       WHERE id = $1`,
      [offerId]
    );

    // Log to history
    await client.query(
      `INSERT INTO alien_trade_history (
        universe_id, alien_ship_id, player_id,
        fuel_traded, organics_traded, equipment_traded, credits_traded,
        outcome, was_robbery, alien_race, alien_alignment, sector_number
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        offer.universe_id,
        offer.alien_ship_id,
        playerId,
        offer.alien_offers_fuel,
        offer.alien_offers_organics,
        offer.alien_offers_equipment,
        -offer.alien_requests_credits, // Negative = player paid
        'completed',
        false,
        alien.alien_race,
        alien.alignment,
        alien.sector_number
      ]
    );

    // Log event
    await client.query(
      `INSERT INTO game_events (universe_id, player_id, event_type, event_data, sector_number)
       VALUES ($1, $2, 'trade', $3, $4)`,
      [
        offer.universe_id,
        playerId,
        JSON.stringify({
          type: 'alien_trade',
          alienRace: alien.alien_race,
          alienShip: alien.ship_name,
          cargo: {
            fuel: offer.alien_offers_fuel,
            organics: offer.alien_offers_organics,
            equipment: offer.alien_offers_equipment
          },
          creditsPaid: offer.alien_requests_credits
        }),
        alien.sector_number
      ]
    );

    await client.query('COMMIT');

    // Emit WebSocket event
    try {
      const emit = await getEmitPlayerEvent();
      emit(playerId, 'alien_trade_accepted', {
        offerId: offerId,
        alienRace: alien.alien_race,
        cargo: {
          fuel: offer.alien_offers_fuel,
          organics: offer.alien_offers_organics,
          equipment: offer.alien_offers_equipment
        },
        creditsPaid: offer.alien_requests_credits
      });
    } catch (wsError) {
      console.error('Error emitting trade accepted event:', wsError);
      // Non-fatal
    }

    return {
      success: true,
      message: `Trade completed! Received cargo for ₡${offer.alien_requests_credits}`
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error accepting alien trade:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Attempt to rob an alien trader
 * 20% success chance, 80% triggers combat with penalty
 */
export async function attemptAlienRobbery(
  offerId: number,
  playerId: number
): Promise<{
  success: boolean;
  outcome: 'robbery_success' | 'robbery_combat';
  message?: string;
  error?: string;
  combatData?: any;
}> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get and lock the trade offer
    const offerResult = await client.query(
      `SELECT * FROM alien_trade_offers
       WHERE id = $1 AND player_id = $2
       FOR UPDATE`,
      [offerId, playerId]
    );

    if (offerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, outcome: 'robbery_combat', error: 'Trade offer not found' };
    }

    const offer = offerResult.rows[0];

    // Validate offer status
    if (offer.status !== 'pending') {
      await client.query('ROLLBACK');
      return { success: false, outcome: 'robbery_combat', error: 'Trade offer is no longer pending' };
    }

    // Get alien and player data
    const alienResult = await client.query(
      `SELECT * FROM alien_ships WHERE id = $1 FOR UPDATE`,
      [offer.alien_ship_id]
    );

    const playerResult = await client.query(
      `SELECT * FROM players WHERE id = $1 FOR UPDATE`,
      [playerId]
    );

    if (alienResult.rows.length === 0 || playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, outcome: 'robbery_combat', error: 'Alien or player not found' };
    }

    const alien = alienResult.rows[0];
    const player = playerResult.rows[0];

    // Roll for robbery success
    const roll = Math.random();
    const isSuccess = roll < ROBBERY_SUCCESS_CHANCE;

    if (isSuccess) {
      // Robbery successful! Player steals ALL alien cargo
      const stolenFuel = alien.cargo_fuel;
      const stolenOrganics = alien.cargo_organics;
      const stolenEquipment = alien.cargo_equipment;
      const totalStolen = stolenFuel + stolenOrganics + stolenEquipment;

      // Check cargo space
      const currentCargo = player.cargo_fuel + player.cargo_organics + player.cargo_equipment;
      const availableSpace = player.ship_holds_max - currentCargo;

      if (totalStolen > availableSpace) {
        await client.query('ROLLBACK');
        return {
          success: false,
          outcome: 'robbery_combat',
          error: `Cannot steal cargo - insufficient space. Need ${totalStolen} holds, have ${availableSpace}`
        };
      }

      // Transfer cargo
      await client.query(
        `UPDATE players
         SET cargo_fuel = cargo_fuel + $1,
             cargo_organics = cargo_organics + $2,
             cargo_equipment = cargo_equipment + $3
         WHERE id = $4`,
        [stolenFuel, stolenOrganics, stolenEquipment, playerId]
      );

      await client.query(
        `UPDATE alien_ships
         SET cargo_fuel = 0,
             cargo_organics = 0,
             cargo_equipment = 0
         WHERE id = $1`,
        [alien.id]
      );

      // Mark offer as robbed
      await client.query(
        `UPDATE alien_trade_offers
         SET status = 'robbed', completed_at = NOW()
         WHERE id = $1`,
        [offerId]
      );

      // Log to history
      await client.query(
        `INSERT INTO alien_trade_history (
          universe_id, alien_ship_id, player_id,
          fuel_traded, organics_traded, equipment_traded, credits_traded,
          outcome, was_robbery, robber_id, alien_race, alien_alignment, sector_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          offer.universe_id,
          alien.id,
          playerId,
          stolenFuel,
          stolenOrganics,
          stolenEquipment,
          0,
          'robbery_success',
          true,
          playerId,
          alien.alien_race,
          alien.alignment,
          alien.sector_number
        ]
      );

      await client.query('COMMIT');

      // Emit WebSocket event for successful robbery
      try {
        const emit = await getEmitPlayerEvent();
        emit(playerId, 'alien_robbery_success', {
          offerId: offerId,
          alienRace: alien.alien_race,
          stolenCargo: {
            fuel: stolenFuel,
            organics: stolenOrganics,
            equipment: stolenEquipment
          }
        });
      } catch (wsError) {
        console.error('Error emitting robbery success event:', wsError);
        // Non-fatal
      }

      return {
        success: true,
        outcome: 'robbery_success',
        message: `Robbery successful! Stole ${stolenFuel} fuel, ${stolenOrganics} organics, ${stolenEquipment} equipment`
      };
    } else {
      // Robbery failed - triggers combat with penalty
      // Mark offer as robbed (failed)
      await client.query(
        `UPDATE alien_trade_offers
         SET status = 'robbed', completed_at = NOW()
         WHERE id = $1`,
        [offerId]
      );

      // Log failed robbery
      await client.query(
        `INSERT INTO alien_trade_history (
          universe_id, alien_ship_id, player_id,
          fuel_traded, organics_traded, equipment_traded, credits_traded,
          outcome, was_robbery, robber_id, alien_race, alien_alignment, sector_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          offer.universe_id,
          alien.id,
          playerId,
          0, 0, 0, 0,
          'robbery_combat',
          true,
          playerId,
          alien.alien_race,
          alien.alignment,
          alien.sector_number
        ]
      );

      await client.query('COMMIT');

      // Emit WebSocket event for combat trigger
      try {
        const emit = await getEmitPlayerEvent();
        emit(playerId, 'alien_robbery_combat', {
          offerId: offerId,
          alienRace: alien.alien_race,
          alienShipId: alien.id,
          message: 'Robbery failed! The alien is attacking with advantage!'
        });
      } catch (wsError) {
        console.error('Error emitting robbery combat event:', wsError);
        // Non-fatal
      }

      // Return combat trigger data
      // The controller will initiate combat with the penalty
      return {
        success: true,
        outcome: 'robbery_combat',
        message: 'Robbery failed - alien is attacking!',
        combatData: {
          alienShipId: alien.id,
          playerId: playerId,
          robberPenalty: ROBBERY_COMBAT_PENALTY
        }
      };
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error attempting alien robbery:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Cancel a trade offer
 */
export async function cancelAlienTrade(
  offerId: number,
  playerId: number
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const result = await pool.query(
      `UPDATE alien_trade_offers
       SET status = 'cancelled', completed_at = NOW()
       WHERE id = $1 AND player_id = $2 AND status = 'pending'
       RETURNING *`,
      [offerId, playerId]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Trade offer not found or already completed' };
    }

    // Emit WebSocket event for cancelled trade
    try {
      const emit = await getEmitPlayerEvent();
      emit(playerId, 'alien_trade_cancelled', {
        offerId: offerId,
        message: 'Trade offer cancelled'
      });
    } catch (wsError) {
      console.error('Error emitting trade cancel event:', wsError);
      // Non-fatal
    }

    return { success: true, message: 'Trade offer cancelled' };
  } catch (error) {
    console.error('Error cancelling trade:', error);
    throw error;
  }
}

/**
 * Cleanup expired trade offers
 * Run this periodically via cron
 */
export async function cleanupExpiredOffers(): Promise<number> {
  try {
    const result = await pool.query('SELECT expire_alien_trade_offers()');
    const expiredCount = result.rows[0].expire_alien_trade_offers;

    if (expiredCount > 0) {
      console.log(`[Alien Trading] Expired ${expiredCount} old trade offers`);
    }

    return expiredCount;
  } catch (error) {
    console.error('Error cleaning up expired offers:', error);
    throw error;
  }
}

/**
 * Generate trade offer when player enters a sector with a trade alien
 * Called automatically when player moves
 */
export async function generateTradeOfferOnEntry(
  playerId: number,
  universeId: number,
  sectorNumber: number
): Promise<void> {
  try {
    // Find trade aliens in this sector
    const result = await pool.query(
      `SELECT id FROM alien_ships
       WHERE universe_id = $1 AND sector_number = $2 AND behavior = 'trade'`,
      [universeId, sectorNumber]
    );

    // Generate offers for each trade alien
    for (const row of result.rows) {
      await generateTradeOffer(row.id, playerId);
    }
  } catch (error) {
    console.error('Error generating trade offer on entry:', error);
    // Non-fatal - don't throw
  }
}

/**
 * Get trade history for a player
 */
export async function getPlayerTradeHistory(
  playerId: number,
  limit = 50,
  client = pool
): Promise<AlienTradeHistory[]> {
  try {
    const result = await client.query(
      `SELECT * FROM alien_trade_history
       WHERE player_id = $1
       ORDER BY traded_at DESC
       LIMIT $2`,
      [playerId, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      universeId: row.universe_id,
      alienShipId: row.alien_ship_id,
      playerId: row.player_id,
      fuelTraded: row.fuel_traded,
      organicsTraded: row.organics_traded,
      equipmentTraded: row.equipment_traded,
      creditsTraded: row.credits_traded,
      outcome: row.outcome,
      wasRobbery: row.was_robbery,
      robberId: row.robber_id,
      alienRace: row.alien_race,
      alienAlignment: row.alien_alignment,
      sectorNumber: row.sector_number,
      tradedAt: row.traded_at
    }));
  } catch (error) {
    console.error('Error getting trade history:', error);
    throw error;
  }
}

/**
 * Helper: Map database row to AlienTradeOffer type
 */
function mapTradeOfferFromDb(row: any, alienData?: any): AlienTradeOffer {
  return {
    id: row.id,
    universeId: row.universe_id,
    alienShipId: row.alien_ship_id,
    playerId: row.player_id,
    alienOffersCredits: row.alien_offers_credits,
    alienOffersFuel: row.alien_offers_fuel,
    alienOffersOrganics: row.alien_offers_organics,
    alienOffersEquipment: row.alien_offers_equipment,
    alienRequestsCredits: row.alien_requests_credits,
    alienRequestsFuel: row.alien_requests_fuel,
    alienRequestsOrganics: row.alien_requests_organics,
    alienRequestsEquipment: row.alien_requests_equipment,
    alienAlignment: row.alien_alignment,
    priceModifier: parseFloat(row.price_modifier),
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
    alienShip: alienData ? {
      id: alienData.id || row.alien_ship_id,
      race: alienData.race || row.race,
      shipName: alienData.ship_name || row.ship_name,
      shipType: alienData.ship_type || row.ship_type,
      sectorNumber: alienData.sector_number || row.sector_number,
      alignment: alienData.alignment || row.alignment,
      cargoFuel: alienData.cargo_fuel || row.cargo_fuel || 0,
      cargoOrganics: alienData.cargo_organics || row.cargo_organics || 0,
      cargoEquipment: alienData.cargo_equipment || row.cargo_equipment || 0
    } : row.race ? {
      id: row.alien_ship_id,
      race: row.race,
      shipName: row.ship_name,
      shipType: row.ship_type,
      sectorNumber: row.sector_number,
      alignment: row.alignment,
      cargoFuel: row.cargo_fuel || 0,
      cargoOrganics: row.cargo_organics || 0,
      cargoEquipment: row.cargo_equipment || 0
    } : undefined
  };
}
