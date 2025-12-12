/**
 * Player-to-Player Trading Service
 *
 * Handles all business logic for player trading operations:
 * - Creating trade offers between players
 * - Accepting trades with same-sector validation
 * - Robbery mechanics with corporation protection
 * - Cancellation by either party
 * - Trade history tracking
 * - Auto-expiry cleanup
 */

import pool from '../db';
import type { PlayerTradeOffer, PlayerTradeHistory, PlayerRobberyResult } from '../../../shared/types';

// Constants
const PLAYER_ROBBERY_SUCCESS_RATE = 0.25; // 25% success rate
const ROBBER_COMBAT_PENALTY = -0.20; // -20% combat effectiveness
const TRADE_EXPIRY_HOURS = 24; // 24 hours
const MAX_PENDING_OFFERS_PER_PLAYER = 10;

// Lazy-loaded WebSocket emitter to avoid circular dependencies
let emitPlayerEvent: ((playerId: number, event: string, data: any) => void) | null = null;

const getEmitPlayerEvent = async () => {
  if (!emitPlayerEvent) {
    const indexModule = await import('../index');
    emitPlayerEvent = indexModule.emitPlayerEvent;
  }
  return emitPlayerEvent;
};

/**
 * Create a new trade offer from initiator to recipient
 */
export async function createTradeOffer(
  initiatorPlayerId: number,
  recipientPlayerId: number,
  sectorId: number,
  offers: {
    fuel: number;
    organics: number;
    equipment: number;
    credits: number;
  },
  requests: {
    fuel: number;
    organics: number;
    equipment: number;
    credits: number;
  },
  message?: string
): Promise<{ success: boolean; offer?: PlayerTradeOffer; error?: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Validate both players exist and get their details
    const playersResult = await client.query(
      `SELECT p.id, p.name, p.universe_id, p.current_sector_id, p.credits, p.fuel, p.organics, p.equipment,
              st.cargo_capacity
       FROM players p
       JOIN ship_types st ON p.ship_type_id = st.id
       WHERE p.id = ANY($1::int[])`,
      [[initiatorPlayerId, recipientPlayerId]]
    );

    if (playersResult.rows.length !== 2) {
      await client.query('ROLLBACK');
      return { success: false, error: 'One or both players not found' };
    }

    const initiator = playersResult.rows.find((p) => p.id === initiatorPlayerId);
    const recipient = playersResult.rows.find((p) => p.id === recipientPlayerId);

    if (!initiator || !recipient) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Player data error' };
    }

    // 2. Validate same universe
    if (initiator.universe_id !== recipient.universe_id) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Players must be in the same universe' };
    }

    // 3. Validate same sector
    if (initiator.current_sector_id !== sectorId || recipient.current_sector_id !== sectorId) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Both players must be in the same sector' };
    }

    // 4. Validate initiator has resources they're offering
    const currentCargo = initiator.fuel + initiator.organics + initiator.equipment;
    if (
      offers.credits > initiator.credits ||
      offers.fuel > initiator.fuel ||
      offers.organics > initiator.organics ||
      offers.equipment > initiator.equipment
    ) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Insufficient resources to create offer' };
    }

    // 5. Validate at least one offer and one request
    const hasOffers = offers.fuel > 0 || offers.organics > 0 || offers.equipment > 0 || offers.credits > 0;
    const hasRequests = requests.fuel > 0 || requests.organics > 0 || requests.equipment > 0 || requests.credits > 0;

    if (!hasOffers) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Must offer at least one resource' };
    }

    if (!hasRequests) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Must request at least one resource' };
    }

    // 6. Check pending offer limit (database trigger will also catch this)
    const pendingCountResult = await client.query(
      `SELECT COUNT(*) as count
       FROM player_trade_offers
       WHERE initiator_player_id = $1 AND status = 'pending'`,
      [initiatorPlayerId]
    );

    if (parseInt(pendingCountResult.rows[0].count) >= MAX_PENDING_OFFERS_PER_PLAYER) {
      await client.query('ROLLBACK');
      return { success: false, error: `Maximum ${MAX_PENDING_OFFERS_PER_PLAYER} pending offers reached` };
    }

    // 7. Sanitize message (basic XSS prevention)
    const sanitizedMessage = message
      ? message.replace(/[<>]/g, '').substring(0, 500)
      : null;

    // 8. Calculate expiration (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TRADE_EXPIRY_HOURS);

    // 9. Insert trade offer
    const insertResult = await client.query(
      `INSERT INTO player_trade_offers (
        universe_id, initiator_player_id, recipient_player_id, sector_id,
        initiator_offers_fuel, initiator_offers_organics, initiator_offers_equipment, initiator_offers_credits,
        initiator_requests_fuel, initiator_requests_organics, initiator_requests_equipment, initiator_requests_credits,
        message, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        initiator.universe_id,
        initiatorPlayerId,
        recipientPlayerId,
        sectorId,
        offers.fuel,
        offers.organics,
        offers.equipment,
        offers.credits,
        requests.fuel,
        requests.organics,
        requests.equipment,
        requests.credits,
        sanitizedMessage,
        expiresAt,
      ]
    );

    const offer = insertResult.rows[0];

    await client.query('COMMIT');

    // 10. Emit WebSocket event to recipient
    try {
      const emit = await getEmitPlayerEvent();
      emit(recipientPlayerId, 'player_trade_offer_received', {
        offerId: offer.id,
        initiatorName: initiator.name,
        initiatorId: initiatorPlayerId,
      });
    } catch (error) {
      console.error('WebSocket emission error:', error);
      // Non-fatal
    }

    return { success: true, offer };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error creating trade offer:', error);
    return { success: false, error: error.message || 'Failed to create trade offer' };
  } finally {
    client.release();
  }
}

/**
 * Get trade offers for a player (inbox or outbox)
 */
export async function getPlayerTradeOffers(
  playerId: number,
  type: 'inbox' | 'outbox'
): Promise<PlayerTradeOffer[]> {
  try {
    const isInbox = type === 'inbox';
    const playerIdColumn = isInbox ? 'recipient_player_id' : 'initiator_player_id';
    const otherPlayerIdColumn = isInbox ? 'initiator_player_id' : 'recipient_player_id';
    const otherPlayerAlias = isInbox ? 'initiator_name' : 'recipient_name';

    const result = await pool.query(
      `SELECT
        pto.*,
        p.name as ${otherPlayerAlias},
        s.name as sector_name
       FROM player_trade_offers pto
       JOIN players p ON p.id = pto.${otherPlayerIdColumn}
       JOIN sectors s ON s.id = pto.sector_id
       WHERE pto.${playerIdColumn} = $1
         AND pto.status = 'pending'
       ORDER BY pto.created_at DESC`,
      [playerId]
    );

    return result.rows;
  } catch (error) {
    console.error(`Error getting ${type}:`, error);
    return [];
  }
}

/**
 * Accept a trade offer (bidirectional resource transfer)
 */
export async function acceptPlayerTrade(
  offerId: number,
  acceptorPlayerId: number
): Promise<{
  success: boolean;
  message?: string;
  initiatorPlayer?: any;
  recipientPlayer?: any;
  error?: string;
}> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock and fetch the offer
    const offerResult = await client.query(
      `SELECT pto.*, p1.name as initiator_name, p2.name as recipient_name
       FROM player_trade_offers pto
       JOIN players p1 ON p1.id = pto.initiator_player_id
       JOIN players p2 ON p2.id = pto.recipient_player_id
       WHERE pto.id = $1
       FOR UPDATE`,
      [offerId]
    );

    if (offerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Trade offer not found' };
    }

    const offer = offerResult.rows[0];

    // 2. Validate acceptor is the recipient
    if (offer.recipient_player_id !== acceptorPlayerId) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Only the recipient can accept this trade' };
    }

    // 3. Validate offer status
    if (offer.status !== 'pending') {
      await client.query('ROLLBACK');
      return { success: false, error: `Trade is ${offer.status}` };
    }

    // 4. Validate not expired
    const now = new Date();
    const expiresAt = new Date(offer.expires_at);
    if (now >= expiresAt) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Trade offer has expired' };
    }

    // 5. Lock and fetch both players with current sector info
    const playersResult = await client.query(
      `SELECT p.id, p.name, p.current_sector_id, p.credits, p.fuel, p.organics, p.equipment,
              st.cargo_capacity
       FROM players p
       JOIN ship_types st ON p.ship_type_id = st.id
       WHERE p.id = ANY($1::int[])
       FOR UPDATE`,
      [[offer.initiator_player_id, offer.recipient_player_id]]
    );

    if (playersResult.rows.length !== 2) {
      await client.query('ROLLBACK');
      return { success: false, error: 'One or both players not found' };
    }

    const initiator = playersResult.rows.find((p) => p.id === offer.initiator_player_id);
    const recipient = playersResult.rows.find((p) => p.id === offer.recipient_player_id);

    if (!initiator || !recipient) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Player data error' };
    }

    // 6. CRITICAL: Validate both players still in same sector
    if (initiator.current_sector_id !== recipient.current_sector_id) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Players must be in the same sector to complete trade' };
    }

    // 7. Validate initiator still has offered resources
    if (
      offer.initiator_offers_credits > initiator.credits ||
      offer.initiator_offers_fuel > initiator.fuel ||
      offer.initiator_offers_organics > initiator.organics ||
      offer.initiator_offers_equipment > initiator.equipment
    ) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Initiator no longer has offered resources' };
    }

    // 8. Validate recipient has requested resources
    if (
      offer.initiator_requests_credits > recipient.credits ||
      offer.initiator_requests_fuel > recipient.fuel ||
      offer.initiator_requests_organics > recipient.organics ||
      offer.initiator_requests_equipment > recipient.equipment
    ) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You do not have the requested resources' };
    }

    // 9. Validate cargo space for both players after trade
    const initiatorCurrentCargo = initiator.fuel + initiator.organics + initiator.equipment;
    const initiatorCargoAfterTrade =
      initiatorCurrentCargo -
      (offer.initiator_offers_fuel + offer.initiator_offers_organics + offer.initiator_offers_equipment) +
      (offer.initiator_requests_fuel + offer.initiator_requests_organics + offer.initiator_requests_equipment);

    const recipientCurrentCargo = recipient.fuel + recipient.organics + recipient.equipment;
    const recipientCargoAfterTrade =
      recipientCurrentCargo +
      (offer.initiator_offers_fuel + offer.initiator_offers_organics + offer.initiator_offers_equipment) -
      (offer.initiator_requests_fuel + offer.initiator_requests_organics + offer.initiator_requests_equipment);

    if (initiatorCargoAfterTrade > initiator.cargo_capacity) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Initiator would exceed cargo capacity' };
    }

    if (recipientCargoAfterTrade > recipient.cargo_capacity) {
      await client.query('ROLLBACK');
      return { success: false, error: 'You would exceed your cargo capacity' };
    }

    // 10. Execute bidirectional transfer
    // Initiator gives offers, receives requests
    await client.query(
      `UPDATE players
       SET
         credits = credits - $1 + $2,
         fuel = fuel - $3 + $4,
         organics = organics - $5 + $6,
         equipment = equipment - $7 + $8
       WHERE id = $9`,
      [
        offer.initiator_offers_credits,
        offer.initiator_requests_credits,
        offer.initiator_offers_fuel,
        offer.initiator_requests_fuel,
        offer.initiator_offers_organics,
        offer.initiator_requests_organics,
        offer.initiator_offers_equipment,
        offer.initiator_requests_equipment,
        offer.initiator_player_id,
      ]
    );

    // Recipient receives offers, gives requests
    await client.query(
      `UPDATE players
       SET
         credits = credits + $1 - $2,
         fuel = fuel + $3 - $4,
         organics = organics + $5 - $6,
         equipment = equipment + $7 - $8
       WHERE id = $9`,
      [
        offer.initiator_offers_credits,
        offer.initiator_requests_credits,
        offer.initiator_offers_fuel,
        offer.initiator_requests_fuel,
        offer.initiator_offers_organics,
        offer.initiator_requests_organics,
        offer.initiator_offers_equipment,
        offer.initiator_requests_equipment,
        offer.recipient_player_id,
      ]
    );

    // 11. Update offer status
    await client.query(
      `UPDATE player_trade_offers
       SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [offerId]
    );

    // 12. Log to history
    await client.query(
      `INSERT INTO player_trade_history (
        offer_id, universe_id, initiator_player_id, recipient_player_id, sector_id,
        action, fuel_transferred, organics_transferred, equipment_transferred, credits_transferred
      ) VALUES ($1, $2, $3, $4, $5, 'accepted', $6, $7, $8, $9)`,
      [
        offerId,
        offer.universe_id,
        offer.initiator_player_id,
        offer.recipient_player_id,
        offer.sector_id,
        offer.initiator_offers_fuel,
        offer.initiator_offers_organics,
        offer.initiator_offers_equipment,
        offer.initiator_offers_credits,
      ]
    );

    // 13. Fetch updated player states
    const updatedPlayersResult = await client.query(
      `SELECT * FROM players WHERE id = ANY($1::int[])`,
      [[offer.initiator_player_id, offer.recipient_player_id]]
    );

    const updatedInitiator = updatedPlayersResult.rows.find((p) => p.id === offer.initiator_player_id);
    const updatedRecipient = updatedPlayersResult.rows.find((p) => p.id === offer.recipient_player_id);

    await client.query('COMMIT');

    // 14. Emit WebSocket events to both players
    try {
      const emit = await getEmitPlayerEvent();
      emit(offer.initiator_player_id, 'player_trade_completed', {
        offerId,
        message: `${offer.recipient_name} accepted your trade offer`,
      });
      emit(offer.recipient_player_id, 'player_trade_completed', {
        offerId,
        message: `You accepted trade from ${offer.initiator_name}`,
      });
    } catch (error) {
      console.error('WebSocket emission error:', error);
      // Non-fatal
    }

    return {
      success: true,
      message: `Trade completed with ${offer.initiator_name}`,
      initiatorPlayer: updatedInitiator,
      recipientPlayer: updatedRecipient,
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error accepting trade:', error);
    return { success: false, error: error.message || 'Failed to accept trade' };
  } finally {
    client.release();
  }
}

/**
 * Attempt to rob a player trade offer (25% success, 75% combat)
 */
export async function attemptPlayerRobbery(
  offerId: number,
  robberId: number
): Promise<PlayerRobberyResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock and fetch the offer
    const offerResult = await client.query(
      `SELECT pto.*, p1.name as initiator_name
       FROM player_trade_offers pto
       JOIN players p1 ON p1.id = pto.initiator_player_id
       WHERE pto.id = $1
       FOR UPDATE`,
      [offerId]
    );

    if (offerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        outcome: 'robbery_combat',
        message: 'Trade offer not found',
        error: 'Trade offer not found',
      };
    }

    const offer = offerResult.rows[0];

    // 2. Validate offer status
    if (offer.status !== 'pending') {
      await client.query('ROLLBACK');
      return {
        success: false,
        outcome: 'robbery_combat',
        message: `Trade is ${offer.status}`,
        error: `Trade is ${offer.status}`,
      };
    }

    // 3. Validate not expired
    const now = new Date();
    const expiresAt = new Date(offer.expires_at);
    if (now >= expiresAt) {
      await client.query('ROLLBACK');
      return {
        success: false,
        outcome: 'robbery_combat',
        message: 'Trade offer has expired',
        error: 'Trade offer has expired',
      };
    }

    // 4. Validate robber is not the initiator (can only rob as third party)
    // Note: The recipient could rob their own offer, but that's unusual
    if (offer.initiator_player_id === robberId) {
      await client.query('ROLLBACK');
      return {
        success: false,
        outcome: 'robbery_combat',
        message: 'Cannot rob your own trade offer',
        error: 'Cannot rob your own trade offer',
      };
    }

    // 5. Lock and fetch robber and initiator (victim)
    const playersResult = await client.query(
      `SELECT p.id, p.name, p.current_sector_id, p.credits, p.fuel, p.organics, p.equipment,
              p.corporation_id, st.cargo_capacity
       FROM players p
       JOIN ship_types st ON p.ship_type_id = st.id
       WHERE p.id = ANY($1::int[])
       FOR UPDATE`,
      [[robberId, offer.initiator_player_id]]
    );

    if (playersResult.rows.length !== 2) {
      await client.query('ROLLBACK');
      return {
        success: false,
        outcome: 'robbery_combat',
        message: 'One or both players not found',
        error: 'One or both players not found',
      };
    }

    const robber = playersResult.rows.find((p) => p.id === robberId);
    const victim = playersResult.rows.find((p) => p.id === offer.initiator_player_id);

    if (!robber || !victim) {
      await client.query('ROLLBACK');
      return {
        success: false,
        outcome: 'robbery_combat',
        message: 'Player data error',
        error: 'Player data error',
      };
    }

    // 6. CRITICAL: Validate both players in same sector
    if (robber.current_sector_id !== victim.current_sector_id) {
      await client.query('ROLLBACK');
      return {
        success: false,
        outcome: 'robbery_combat',
        message: 'Players must be in the same sector',
        error: 'Players must be in the same sector',
      };
    }

    // 7. CRITICAL: Check corporation protection
    if (robber.corporation_id && robber.corporation_id === victim.corporation_id) {
      await client.query('ROLLBACK');
      return {
        success: false,
        outcome: 'robbery_combat',
        message: 'Cannot rob corporation members',
        error: 'Cannot rob corporation members',
      };
    }

    // 8. Validate victim still has offered goods
    if (
      offer.initiator_offers_fuel > victim.fuel ||
      offer.initiator_offers_organics > victim.organics ||
      offer.initiator_offers_equipment > victim.equipment ||
      offer.initiator_offers_credits > victim.credits
    ) {
      await client.query('ROLLBACK');
      return {
        success: false,
        outcome: 'robbery_combat',
        message: 'Victim no longer has offered resources',
        error: 'Victim no longer has offered resources',
      };
    }

    // 9. Validate robber has cargo space
    const robberCurrentCargo = robber.fuel + robber.organics + robber.equipment;
    const stolenCargo = offer.initiator_offers_fuel + offer.initiator_offers_organics + offer.initiator_offers_equipment;
    const robberCargoAfterRobbery = robberCurrentCargo + stolenCargo;

    if (robberCargoAfterRobbery > robber.cargo_capacity) {
      await client.query('ROLLBACK');
      return {
        success: false,
        outcome: 'robbery_combat',
        message: 'Insufficient cargo space for stolen goods',
        error: 'Insufficient cargo space for stolen goods',
      };
    }

    // 10. Roll dice for robbery outcome (25% success)
    const roll = Math.random();
    const robberySuccessful = roll < PLAYER_ROBBERY_SUCCESS_RATE;

    if (robberySuccessful) {
      // ROBBERY SUCCESS: Transfer goods to robber
      await client.query(
        `UPDATE players
         SET
           credits = credits + $1,
           fuel = fuel + $2,
           organics = organics + $3,
           equipment = equipment + $4
         WHERE id = $5`,
        [
          offer.initiator_offers_credits,
          offer.initiator_offers_fuel,
          offer.initiator_offers_organics,
          offer.initiator_offers_equipment,
          robberId,
        ]
      );

      // Deduct from victim
      await client.query(
        `UPDATE players
         SET
           credits = credits - $1,
           fuel = fuel - $2,
           organics = organics - $3,
           equipment = equipment - $4
         WHERE id = $5`,
        [
          offer.initiator_offers_credits,
          offer.initiator_offers_fuel,
          offer.initiator_offers_organics,
          offer.initiator_offers_equipment,
          offer.initiator_player_id,
        ]
      );

      // Update offer status
      await client.query(
        `UPDATE player_trade_offers
         SET status = 'robbed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [offerId]
      );

      // Log to history
      await client.query(
        `INSERT INTO player_trade_history (
          offer_id, universe_id, initiator_player_id, recipient_player_id, sector_id,
          action, fuel_transferred, organics_transferred, equipment_transferred, credits_transferred
        ) VALUES ($1, $2, $3, $4, $5, 'robbed_success', $6, $7, $8, $9)`,
        [
          offerId,
          offer.universe_id,
          offer.initiator_player_id,
          offer.recipient_player_id,
          offer.sector_id,
          offer.initiator_offers_fuel,
          offer.initiator_offers_organics,
          offer.initiator_offers_equipment,
          offer.initiator_offers_credits,
        ]
      );

      // Fetch updated robber state
      const updatedRobberResult = await client.query(
        `SELECT * FROM players WHERE id = $1`,
        [robberId]
      );

      await client.query('COMMIT');

      // Emit WebSocket events
      try {
        const emit = await getEmitPlayerEvent();
        emit(offer.initiator_player_id, 'player_trade_robbed', {
          offerId,
          message: `${robber.name} successfully robbed your trade offer!`,
        });
        emit(robberId, 'player_trade_robbed', {
          offerId,
          message: `You successfully robbed ${offer.initiator_name}'s trade offer!`,
        });
      } catch (error) {
        console.error('WebSocket emission error:', error);
        // Non-fatal
      }

      return {
        success: true,
        outcome: 'robbery_success',
        message: `Successfully stole goods from ${offer.initiator_name}!`,
        stolenGoods: {
          fuel: offer.initiator_offers_fuel,
          organics: offer.initiator_offers_organics,
          equipment: offer.initiator_offers_equipment,
          credits: offer.initiator_offers_credits,
        },
        player: updatedRobberResult.rows[0],
      };
    } else {
      // ROBBERY FAILED: Trigger combat with -20% penalty for robber
      await client.query('ROLLBACK');

      // Update offer status
      await pool.query(
        `UPDATE player_trade_offers
         SET status = 'robbed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [offerId]
      );

      // Log to history
      await pool.query(
        `INSERT INTO player_trade_history (
          offer_id, universe_id, initiator_player_id, recipient_player_id, sector_id,
          action
        ) VALUES ($1, $2, $3, $4, $5, 'robbed_failed')`,
        [offerId, offer.universe_id, offer.initiator_player_id, offer.recipient_player_id, offer.sector_id]
      );

      // Import combat service
      const { playerAttacksPlayer } = await import('./combatService');

      // Execute combat with robber penalty
      const combatResult = await playerAttacksPlayer(
        robberId,
        offer.initiator_player_id,
        ROBBER_COMBAT_PENALTY
      );

      // Emit WebSocket events
      try {
        const emit = await getEmitPlayerEvent();
        emit(offer.initiator_player_id, 'player_trade_robbed', {
          offerId,
          message: `${robber.name} attempted to rob your trade but triggered combat!`,
        });
        emit(robberId, 'player_trade_robbed', {
          offerId,
          message: 'Robbery failed! Combat initiated.',
        });
      } catch (error) {
        console.error('WebSocket emission error:', error);
        // Non-fatal
      }

      return {
        success: false,
        outcome: 'robbery_combat',
        message: 'Robbery failed! Combat initiated.',
        combatResult,
      };
    }
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error attempting robbery:', error);
    return {
      success: false,
      outcome: 'robbery_combat',
      message: error.message || 'Failed to attempt robbery',
      error: error.message,
    };
  } finally {
    client.release();
  }
}

/**
 * Cancel a trade offer (can be done by initiator or recipient)
 */
export async function cancelPlayerTrade(
  offerId: number,
  cancellerPlayerId: number
): Promise<{ success: boolean; message?: string; error?: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Lock and fetch the offer
    const offerResult = await client.query(
      `SELECT pto.*, p1.name as initiator_name, p2.name as recipient_name
       FROM player_trade_offers pto
       JOIN players p1 ON p1.id = pto.initiator_player_id
       JOIN players p2 ON p2.id = pto.recipient_player_id
       WHERE pto.id = $1
       FOR UPDATE`,
      [offerId]
    );

    if (offerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Trade offer not found' };
    }

    const offer = offerResult.rows[0];

    // 2. Validate canceller is initiator or recipient
    if (offer.initiator_player_id !== cancellerPlayerId && offer.recipient_player_id !== cancellerPlayerId) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Only trade participants can cancel' };
    }

    // 3. Validate offer status
    if (offer.status !== 'pending') {
      await client.query('ROLLBACK');
      return { success: false, error: `Cannot cancel ${offer.status} trade` };
    }

    // 4. Update offer status
    await client.query(
      `UPDATE player_trade_offers
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [offerId]
    );

    // 5. Log to history
    await client.query(
      `INSERT INTO player_trade_history (
        offer_id, universe_id, initiator_player_id, recipient_player_id, sector_id, action
      ) VALUES ($1, $2, $3, $4, $5, 'cancelled')`,
      [offerId, offer.universe_id, offer.initiator_player_id, offer.recipient_player_id, offer.sector_id]
    );

    await client.query('COMMIT');

    // 6. Emit WebSocket events to both players
    const isInitiator = offer.initiator_player_id === cancellerPlayerId;
    const cancellerName = isInitiator ? offer.initiator_name : offer.recipient_name;
    const otherPlayerId = isInitiator ? offer.recipient_player_id : offer.initiator_player_id;

    try {
      const emit = await getEmitPlayerEvent();
      emit(otherPlayerId, 'player_trade_cancelled', {
        offerId,
        message: `${cancellerName} cancelled the trade offer`,
      });
    } catch (error) {
      console.error('WebSocket emission error:', error);
      // Non-fatal
    }

    return {
      success: true,
      message: 'Trade offer cancelled',
    };
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error cancelling trade:', error);
    return { success: false, error: error.message || 'Failed to cancel trade' };
  } finally {
    client.release();
  }
}

/**
 * Get trade history for a player
 */
export async function getPlayerTradeHistory(
  playerId: number,
  limit: number = 50
): Promise<PlayerTradeHistory[]> {
  try {
    const result = await pool.query(
      `SELECT
        pth.*,
        p1.name as initiator_name,
        p2.name as recipient_name
       FROM player_trade_history pth
       JOIN players p1 ON p1.id = pth.initiator_player_id
       JOIN players p2 ON p2.id = pth.recipient_player_id
       WHERE pth.initiator_player_id = $1 OR pth.recipient_player_id = $1
       ORDER BY pth.created_at DESC
       LIMIT $2`,
      [playerId, limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting trade history:', error);
    return [];
  }
}

/**
 * Cleanup expired player trade offers (called by cron job)
 */
export async function cleanupExpiredPlayerTrades(): Promise<number> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Get expired offers before updating
    const expiredResult = await client.query(
      `SELECT id, universe_id, initiator_player_id, recipient_player_id, sector_id
       FROM player_trade_offers
       WHERE status = 'pending' AND expires_at < CURRENT_TIMESTAMP`
    );

    const expiredOffers = expiredResult.rows;

    if (expiredOffers.length === 0) {
      await client.query('COMMIT');
      return 0;
    }

    // 2. Call expiry function
    await client.query('SELECT expire_player_trade_offers()');

    // 3. Log expired offers to history
    for (const offer of expiredOffers) {
      await client.query(
        `INSERT INTO player_trade_history (
          offer_id, universe_id, initiator_player_id, recipient_player_id, sector_id, action
        ) VALUES ($1, $2, $3, $4, $5, 'expired')`,
        [offer.id, offer.universe_id, offer.initiator_player_id, offer.recipient_player_id, offer.sector_id]
      );
    }

    await client.query('COMMIT');

    console.log(`Expired ${expiredOffers.length} player trade offers`);
    return expiredOffers.length;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cleaning up expired trades:', error);
    return 0;
  } finally {
    client.release();
  }
}
