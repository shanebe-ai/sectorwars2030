import { pool } from '../db/connection';

interface SendMessageParams {
  senderId: number;
  recipientId: number;
  subject?: string;
  body: string;
}

interface Message {
  id: number;
  universeId: number;
  senderId: number | null;
  recipientId: number;
  senderName: string | null;
  subject: string | null;
  body: string;
  isRead: boolean;
  sentAt: Date;
  readAt: Date | null;
}

/**
 * Send a message from one player to another
 */
export async function sendMessage(params: SendMessageParams): Promise<Message> {
  const { senderId, recipientId, subject, body } = params;

  // Get sender info (player and universe)
  const senderResult = await pool.query(
    `SELECT p.id, p.corp_name, p.universe_id, p.current_sector
     FROM players p
     WHERE p.id = $1`,
    [senderId]
  );

  if (senderResult.rows.length === 0) {
    throw new Error('Sender not found');
  }

  const sender = senderResult.rows[0];

  // Verify recipient exists in same universe
  const recipientResult = await pool.query(
    `SELECT p.id, p.universe_id, p.current_sector
     FROM players p
     WHERE p.id = $1 AND p.universe_id = $2`,
    [recipientId, sender.universe_id]
  );

  if (recipientResult.rows.length === 0) {
    throw new Error('Recipient not found in your universe');
  }

  // Insert the message
  const insertResult = await pool.query(
    `INSERT INTO messages (universe_id, sender_id, recipient_id, sender_name, subject, body)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [sender.universe_id, senderId, recipientId, sender.corp_name, subject || null, body]
  );

  const msg = insertResult.rows[0];

  return {
    id: msg.id,
    universeId: msg.universe_id,
    senderId: msg.sender_id,
    recipientId: msg.recipient_id,
    senderName: msg.sender_name,
    subject: msg.subject,
    body: msg.body,
    isRead: msg.is_read,
    sentAt: msg.sent_at,
    readAt: msg.read_at
  };
}

/**
 * Get inbox messages for a player
 */
export async function getInbox(playerId: number): Promise<Message[]> {
  const result = await pool.query(
    `SELECT m.*, p.corp_name as sender_corp_name
     FROM messages m
     LEFT JOIN players p ON m.sender_id = p.id
     WHERE m.recipient_id = $1 AND m.is_deleted_by_recipient = FALSE
     ORDER BY m.sent_at DESC`,
    [playerId]
  );

  return result.rows.map(msg => ({
    id: msg.id,
    universeId: msg.universe_id,
    senderId: msg.sender_id,
    recipientId: msg.recipient_id,
    senderName: msg.sender_corp_name || msg.sender_name || '[Deleted Player]',
    subject: msg.subject,
    body: msg.body,
    isRead: msg.is_read,
    sentAt: msg.sent_at,
    readAt: msg.read_at
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
    universeId: msg.universe_id,
    senderId: msg.sender_id,
    recipientId: msg.recipient_id,
    senderName: msg.sender_name,
    recipientName: msg.recipient_corp_name || '[Deleted Player]',
    subject: msg.subject,
    body: msg.body,
    isRead: msg.is_read,
    sentAt: msg.sent_at,
    readAt: msg.read_at
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
     WHERE m.id = $1 AND (m.sender_id = $2 OR m.recipient_id = $2)`,
    [messageId, playerId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const msg = result.rows[0];

  // Mark as read if recipient is viewing
  if (msg.recipient_id === playerId && !msg.is_read) {
    await pool.query(
      `UPDATE messages SET is_read = TRUE, read_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [messageId]
    );
    msg.is_read = true;
    msg.read_at = new Date();
  }

  return {
    id: msg.id,
    universeId: msg.universe_id,
    senderId: msg.sender_id,
    recipientId: msg.recipient_id,
    senderName: msg.sender_corp_name || msg.sender_name || '[Deleted Player]',
    subject: msg.subject,
    body: msg.body,
    isRead: msg.is_read,
    sentAt: msg.sent_at,
    readAt: msg.read_at
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
  // First check if this player is sender or recipient
  const checkResult = await pool.query(
    `SELECT sender_id, recipient_id FROM messages WHERE id = $1`,
    [messageId]
  );

  if (checkResult.rows.length === 0) {
    return false;
  }

  const msg = checkResult.rows[0];

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
 * Get count of unread messages for a player
 */
export async function getUnreadCount(playerId: number): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*) as count
     FROM messages
     WHERE recipient_id = $1 AND is_read = FALSE AND is_deleted_by_recipient = FALSE`,
    [playerId]
  );

  return parseInt(result.rows[0].count, 10);
}

/**
 * Get players in the same sector (for messaging UI)
 */
export async function getPlayersInSector(playerId: number): Promise<{ id: number; corpName: string }[]> {
  // Get player's current sector
  const playerResult = await pool.query(
    `SELECT universe_id, current_sector FROM players WHERE id = $1`,
    [playerId]
  );

  if (playerResult.rows.length === 0) {
    return [];
  }

  const { universe_id, current_sector } = playerResult.rows[0];

  // Get other players in same sector
  const result = await pool.query(
    `SELECT id, corp_name
     FROM players
     WHERE universe_id = $1 AND current_sector = $2 AND id != $3 AND is_alive = TRUE
     ORDER BY corp_name`,
    [universe_id, current_sector, playerId]
  );

  return result.rows.map(p => ({
    id: p.id,
    corpName: p.corp_name
  }));
}

