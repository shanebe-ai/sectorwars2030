import { pool } from '../db/connection';
import { Message, MessageType, KnownTrader } from '../../../shared/types';

interface SendMessageParams {
  senderId: number;
  recipientId?: number; // Optional for broadcasts
  subject?: string;
  body: string;
  messageType: MessageType;
}

/**
 * Send a message (direct or broadcast)
 */
export async function sendMessage(params: SendMessageParams): Promise<Message> {
  const { senderId, recipientId, subject, body, messageType } = params;

  // Get sender info
  const senderResult = await pool.query(
    `SELECT p.id, p.corp_name, p.universe_id
     FROM players p
     WHERE p.id = $1`,
    [senderId]
  );

  if (senderResult.rows.length === 0) {
    throw new Error('Sender not found');
  }

  const sender = senderResult.rows[0];

  // Validate based on message type
  if (messageType === 'DIRECT') {
    if (!recipientId) {
      throw new Error('Recipient required for direct messages');
    }

    // Verify recipient exists in same universe
    const recipientResult = await pool.query(
      `SELECT p.id FROM players p WHERE p.id = $1 AND p.universe_id = $2`,
      [recipientId, sender.universe_id]
    );

    if (recipientResult.rows.length === 0) {
      throw new Error('Recipient not found in your universe');
    }
  } else if (messageType === 'BROADCAST') {
    // Broadcasts should not have a recipient
    if (recipientId) {
      throw new Error('Broadcasts cannot have a recipient');
    }
  }

  // Insert the message
  const insertResult = await pool.query(
    `INSERT INTO messages (universe_id, sender_id, recipient_id, sender_name, subject, body, message_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [sender.universe_id, senderId, recipientId || null, sender.corp_name, subject || null, body, messageType]
  );

  const msg = insertResult.rows[0];

  return {
    id: msg.id,
    universe_id: msg.universe_id,
    sender_id: msg.sender_id,
    recipient_id: msg.recipient_id,
    sender_name: msg.sender_name,
    subject: msg.subject,
    body: msg.body,
    message_type: msg.message_type,
    is_read: msg.is_read,
    is_deleted_by_sender: msg.is_deleted_by_sender,
    is_deleted_by_recipient: msg.is_deleted_by_recipient,
    sent_at: msg.sent_at,
    read_at: msg.read_at
  };
}

/**
 * Get direct message inbox for a player
 */
export async function getInbox(playerId: number): Promise<Message[]> {
  const result = await pool.query(
    `SELECT m.*, p.corp_name as sender_corp_name
     FROM messages m
     LEFT JOIN players p ON m.sender_id = p.id
     WHERE m.recipient_id = $1
       AND m.is_deleted_by_recipient = FALSE
       AND m.message_type = 'DIRECT'
     ORDER BY m.sent_at DESC`,
    [playerId]
  );

  return result.rows.map(msg => ({
    id: msg.id,
    universe_id: msg.universe_id,
    sender_id: msg.sender_id,
    recipient_id: msg.recipient_id,
    sender_name: msg.sender_corp_name || msg.sender_name || '[Deleted Player]',
    subject: msg.subject,
    body: msg.body,
    message_type: msg.message_type,
    is_read: msg.is_read,
    is_deleted_by_sender: msg.is_deleted_by_sender,
    is_deleted_by_recipient: msg.is_deleted_by_recipient,
    sent_at: msg.sent_at,
    read_at: msg.read_at
  }));
}

/**
 * Get broadcast messages for a player's universe
 * Only shows broadcasts sent after the player joined the universe
 */
export async function getBroadcasts(playerId: number): Promise<Message[]> {
  // Get player's universe and creation time
  const playerResult = await pool.query(
    `SELECT universe_id, created_at FROM players WHERE id = $1`,
    [playerId]
  );

  if (playerResult.rows.length === 0) {
    return [];
  }

  const { universe_id, created_at: player_joined_at } = playerResult.rows[0];

  // Only show broadcasts sent AFTER the player joined the universe
  const result = await pool.query(
    `SELECT m.*, p.corp_name as sender_corp_name, u.username as sender_username
     FROM messages m
     LEFT JOIN players p ON m.sender_id = p.id
     LEFT JOIN users u ON p.user_id = u.id
     LEFT JOIN message_deletions md ON m.id = md.message_id AND md.player_id = $3
     WHERE m.universe_id = $1
       AND m.message_type = 'BROADCAST'
       AND m.sent_at >= $2
       AND md.message_id IS NULL
     ORDER BY m.sent_at DESC
     LIMIT 100`,
    [universe_id, player_joined_at, playerId]
  );

  return result.rows.map(msg => ({
    id: msg.id,
    universe_id: msg.universe_id,
    sender_id: msg.sender_id,
    recipient_id: msg.recipient_id,
    sender_name: msg.sender_username || '[Unknown]',
    sender_corp: msg.sender_corp_name || '[Unknown Corp]',
    subject: msg.subject,
    body: msg.body,
    message_type: msg.message_type,
    is_read: msg.is_read,
    is_deleted_by_sender: msg.is_deleted_by_sender,
    is_deleted_by_recipient: msg.is_deleted_by_recipient,
    sent_at: msg.sent_at,
    read_at: msg.read_at
  }));
}

/**
 * Get sent messages for a player
 */
export async function getSentMessages(playerId: number): Promise<Message[]> {
  const result = await pool.query(
    `SELECT m.*, p.corp_name as recipient_corp_name
     FROM messages m
     LEFT JOIN players p ON m.recipient_id = p.id
     WHERE m.sender_id = $1 AND m.is_deleted_by_sender = FALSE
     ORDER BY m.sent_at DESC`,
    [playerId]
  );

  return result.rows.map(msg => ({
    id: msg.id,
    universe_id: msg.universe_id,
    sender_id: msg.sender_id,
    recipient_id: msg.recipient_id,
    sender_name: msg.sender_name,
    recipient_name: msg.recipient_corp_name || (msg.message_type === 'BROADCAST' ? '[Universe Broadcast]' : '[Deleted Player]'),
    subject: msg.subject,
    body: msg.body,
    message_type: msg.message_type,
    is_read: msg.is_read,
    is_deleted_by_sender: msg.is_deleted_by_sender,
    is_deleted_by_recipient: msg.is_deleted_by_recipient,
    sent_at: msg.sent_at,
    read_at: msg.read_at
  }));
}

/**
 * Get a specific message by ID
 */
export async function getMessage(messageId: number, playerId: number): Promise<Message | null> {
  const result = await pool.query(
    `SELECT m.*,
            sender.corp_name as sender_corp_name,
            recipient.corp_name as recipient_corp_name
     FROM messages m
     LEFT JOIN players sender ON m.sender_id = sender.id
     LEFT JOIN players recipient ON m.recipient_id = recipient.id
     WHERE m.id = $1 AND (m.sender_id = $2 OR m.recipient_id = $2 OR m.message_type = 'BROADCAST')`,
    [messageId, playerId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const msg = result.rows[0];

  // Mark as read if recipient is viewing (only for direct messages)
  if (msg.message_type === 'DIRECT' && msg.recipient_id === playerId && !msg.is_read) {
    await pool.query(
      `UPDATE messages SET is_read = TRUE, read_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [messageId]
    );
    msg.is_read = true;
    msg.read_at = new Date();
  }

  return {
    id: msg.id,
    universe_id: msg.universe_id,
    sender_id: msg.sender_id,
    recipient_id: msg.recipient_id,
    sender_name: msg.sender_corp_name || msg.sender_name || '[Deleted Player]',
    subject: msg.subject,
    body: msg.body,
    message_type: msg.message_type,
    is_read: msg.is_read,
    is_deleted_by_sender: msg.is_deleted_by_sender,
    is_deleted_by_recipient: msg.is_deleted_by_recipient,
    sent_at: msg.sent_at,
    read_at: msg.read_at
  };
}

/**
 * Mark a message as read
 */
export async function markAsRead(messageId: number, playerId: number): Promise<boolean> {
  const result = await pool.query(
    `UPDATE messages
     SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND recipient_id = $2
     RETURNING id`,
    [messageId, playerId]
  );

  return result.rows.length > 0;
}

/**
 * Delete a message (soft delete)
 */
export async function deleteMessage(messageId: number, playerId: number): Promise<boolean> {
  // First check if this player is sender or recipient, and get message type
  const checkResult = await pool.query(
    `SELECT sender_id, recipient_id, message_type FROM messages WHERE id = $1`,
    [messageId]
  );

  if (checkResult.rows.length === 0) {
    return false;
  }

  const msg = checkResult.rows[0];

  // Handle broadcasts differently
  if (msg.message_type === 'BROADCAST') {
    // If the sender is deleting their own broadcast (from Sent), mark as deleted by sender
    if (msg.sender_id === playerId) {
      await pool.query(
        `UPDATE messages SET is_deleted_by_sender = TRUE WHERE id = $1`,
        [messageId]
      );
      return true;
    }
    // Otherwise, use message_deletions table for per-player deletion
    await pool.query(
      `INSERT INTO message_deletions (message_id, player_id)
       VALUES ($1, $2)
       ON CONFLICT (message_id, player_id) DO NOTHING`,
      [messageId, playerId]
    );
    return true;
  }

  // Handle DIRECT messages with existing logic
  if (msg.sender_id === playerId) {
    await pool.query(
      `UPDATE messages SET is_deleted_by_sender = TRUE WHERE id = $1`,
      [messageId]
    );
    return true;
  } else if (msg.recipient_id === playerId) {
    await pool.query(
      `UPDATE messages SET is_deleted_by_recipient = TRUE WHERE id = $1`,
      [messageId]
    );
    return true;
  }

  return false;
}

/**
 * Get count of unread direct messages for a player
 */
export async function getUnreadCount(playerId: number): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*) as count
     FROM messages
     WHERE recipient_id = $1
       AND is_read = FALSE
       AND is_deleted_by_recipient = FALSE
       AND message_type = 'DIRECT'`,
    [playerId]
  );

  return parseInt(result.rows[0].count, 10);
}

/**
 * Get known traders (players you've encountered)
 */
export async function getKnownTraders(playerId: number): Promise<KnownTrader[]> {
  const result = await pool.query(
    `SELECT
       pe.encountered_player_id as player_id,
       p.corp_name as player_name,
       p.ship_type,
       pe.last_met_at,
       pe.encounter_count
     FROM player_encounters pe
     JOIN players p ON pe.encountered_player_id = p.id
     WHERE pe.player_id = $1 AND p.is_alive = TRUE
     ORDER BY pe.last_met_at DESC`,
    [playerId]
  );

  return result.rows.map(row => ({
    player_id: row.player_id,
    player_name: row.player_name,
    corp_name: row.player_name, // corp_name is the player identifier
    ship_type: row.ship_type,
    last_met_at: row.last_met_at,
    encounter_count: row.encounter_count
  }));
}

/**
 * Record player encounter (called when players are in same sector)
 */
export async function recordEncounter(playerId: number, encounteredPlayerId: number, universeId: number): Promise<void> {
  if (playerId === encounteredPlayerId) {
    return; // Don't record encounters with self
  }

  await pool.query(
    `INSERT INTO player_encounters (player_id, encountered_player_id, universe_id, last_met_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (player_id, encountered_player_id, universe_id)
     DO UPDATE SET
       last_met_at = CURRENT_TIMESTAMP,
       encounter_count = player_encounters.encounter_count + 1`,
    [playerId, encounteredPlayerId, universeId]
  );
}
