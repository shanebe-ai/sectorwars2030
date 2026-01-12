import { query } from '../db/connection';
import { emitUniverseEvent } from '../index';

/**
 * Broadcast a message via TerraCorp News Network (TNN)
 * Used for player-related events and ship destructions
 */
export async function broadcastTNN(
  universeId: number,
  subject: string,
  message: string
): Promise<void> {
  await query(
    `INSERT INTO messages (universe_id, sender_id, recipient_id, sender_name, subject, body, message_type)
     VALUES ($1, NULL, NULL, 'TerraCorp News Network', $2, $3, 'BROADCAST')`,
    [universeId, subject, message]
  );

  // Emit WebSocket event for real-time notifications
  emitUniverseEvent(universeId, 'new_broadcast', {
    sender: 'TerraCorp News Network',
    subject,
    body: message,
    timestamp: new Date().toISOString()
  });
}

/**
 * Broadcast a message via Alien Communications channel
 * Used for all alien-related events and interactions
 */
export async function broadcastAlienComms(
  universeId: number,
  messageType: string,
  message: string,
  options: {
    alienRace?: string;
    sectorNumber?: number;
    relatedPlayerId?: number;
    relatedShipId?: number;
    relatedPlanetId?: number;
  } = {}
): Promise<void> {
  await query(`
    INSERT INTO alien_communications (
      universe_id, alien_race, message_type, message,
      sector_number, related_player_id, related_ship_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    universeId,
    options.alienRace || null,
    messageType,
    message,
    options.sectorNumber || null,
    options.relatedPlayerId || null,
    options.relatedShipId || options.relatedPlanetId || null
  ]);

  // Emit WebSocket event to all players who have unlocked alien comms
  emitUniverseEvent(universeId, 'alien_communication', {
    alienRace: options.alienRace,
    messageType,
    message,
    sectorNumber: options.sectorNumber
  });
}

/**
 * Send a WebSocket notification for combat results
 * Used for player vs player and player vs alien combat
 */
export async function notifyCombatResult(
  universeId: number,
  sectorNumber: number,
  message: string,
  combatDetails?: {
    attacker?: string;
    defender?: string;
    winner?: string;
    damageDealt?: number;
    lootTaken?: number;
  }
): Promise<void> {
  // Emit WebSocket event for real-time combat notifications
  emitUniverseEvent(universeId, 'combat_result', {
    sectorNumber,
    message,
    timestamp: new Date().toISOString(),
    details: combatDetails
  });
}
