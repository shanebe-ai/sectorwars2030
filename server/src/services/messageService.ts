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
  } else if (messageType === 'CORPORATE') {
    // Corporate messages require sender to be in a corporation
    const corpResult = await pool.query(
      `SELECT cm.corp_id FROM corp_members cm WHERE cm.player_id = $1`,
      [senderId]
    );
    if (corpResult.rows.length === 0) {
      throw new Error('You must be in a corporation to send corporate messages');
    }
  }

  // Get corp_id if sending corporate message
  let corpId = null;
  if (messageType === 'CORPORATE') {
    const corpResult = await pool.query(
      `SELECT cm.corp_id FROM corp_members cm WHERE cm.player_id = $1`,
      [senderId]
    );
    if (corpResult.rows.length > 0) {
      corpId = corpResult.rows[0].corp_id;
    }
  }

  // Insert the message
  const insertResult = await pool.query(
    `INSERT INTO messages (universe_id, sender_id, recipient_id, sender_name, subject, body, message_type, corp_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [sender.universe_id, senderId, recipientId || null, sender.corp_name, subject || null, body, messageType, corpId]
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
    `SELECT m.*, 
       u.username as sender_username,
       p.corp_name as sender_corp_name,
       c.name as sender_corporation_name
     FROM messages m
     LEFT JOIN players p ON m.sender_id = p.id
     LEFT JOIN users u ON p.user_id = u.id
     LEFT JOIN corp_members cm ON p.id = cm.player_id
     LEFT JOIN corporations c ON cm.corp_id = c.id
     WHERE m.recipient_id = $1
       AND m.is_deleted_by_recipient = FALSE
       AND m.message_type = 'DIRECT'
     ORDER BY m.sent_at DESC`,
    [playerId]
  );

  return result.rows.map(msg => {
    let sender_name: string;
    // If sender_name is already set in database (e.g., for beacon messages), use it
    if (msg.sender_name && msg.sender_id === null) {
      sender_name = msg.sender_name;
    } else if (msg.sender_username) {
      // Format as "Username (CorporationName)"
      const corpName = msg.sender_corporation_name || msg.sender_corp_name;
      sender_name = `${msg.sender_username} (${corpName})`;
    } else {
      // Fallback: use stored sender_name if available, otherwise "[Deleted Player]"
      sender_name = msg.sender_name || '[Deleted Player]';
    }
    return {
      id: msg.id,
      universe_id: msg.universe_id,
      sender_id: msg.sender_id,
      recipient_id: msg.recipient_id,
      sender_name,
      subject: msg.subject,
      body: msg.body,
      message_type: msg.message_type,
      is_read: msg.is_read,
      is_deleted_by_sender: msg.is_deleted_by_sender,
      is_deleted_by_recipient: msg.is_deleted_by_recipient,
      sent_at: msg.sent_at,
      read_at: msg.read_at
    };
  });
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
  // Filter out: messages deleted by others (message_deletions) OR sender's own deleted broadcasts
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
       AND NOT (m.sender_id = $3 AND m.is_deleted_by_sender = TRUE)
     ORDER BY m.sent_at DESC
     LIMIT 100`,
    [universe_id, player_joined_at, playerId]
  );

  return result.rows.map(msg => ({
    id: msg.id,
    universe_id: msg.universe_id,
    sender_id: msg.sender_id,
    recipient_id: msg.recipient_id,
    sender_name: msg.sender_name || msg.sender_username || '[Unknown]',
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
    `SELECT m.*, 
       u.username as recipient_username,
       p.corp_name as recipient_corp_name,
       rc.name as recipient_corporation_name,
       c.name as corp_name_for_corporate
     FROM messages m
     LEFT JOIN players p ON m.recipient_id = p.id
     LEFT JOIN users u ON p.user_id = u.id
     LEFT JOIN corp_members rcm ON p.id = rcm.player_id
     LEFT JOIN corporations rc ON rcm.corp_id = rc.id
     LEFT JOIN corporations c ON m.corp_id = c.id
     WHERE m.sender_id = $1 AND m.is_deleted_by_sender = FALSE
     ORDER BY m.sent_at DESC`,
    [playerId]
  );

  return result.rows.map(msg => {
    let recipient_name: string;
    if (msg.message_type === 'BROADCAST') {
      recipient_name = '[Universe Broadcast]';
    } else if (msg.message_type === 'CORPORATE') {
      recipient_name = msg.corp_name_for_corporate || '[Corporate]';
    } else if (msg.recipient_username) {
      // Format as "Username (CorporationName)" for direct messages
      const corpName = msg.recipient_corporation_name || msg.recipient_corp_name;
      recipient_name = `${msg.recipient_username} (${corpName})`;
    } else {
      recipient_name = '[Deleted Player]';
    }
    return {
      id: msg.id,
      universe_id: msg.universe_id,
      sender_id: msg.sender_id,
      recipient_id: msg.recipient_id,
      sender_name: msg.sender_name,
      recipient_name,
      subject: msg.subject,
      body: msg.body,
      message_type: msg.message_type,
      is_read: msg.is_read,
      is_deleted_by_sender: msg.is_deleted_by_sender,
      is_deleted_by_recipient: msg.is_deleted_by_recipient,
      sent_at: msg.sent_at,
      read_at: msg.read_at
    };
  });
}

/**
 * Get a specific message by ID
 */
export async function getMessage(messageId: number, playerId: number): Promise<Message | null> {
  // Get player's corp_id
  const playerResult = await pool.query(
    `SELECT cm.corp_id FROM corp_members cm WHERE cm.player_id = $1`,
    [playerId]
  );
  const corpId = playerResult.rows.length > 0 ? playerResult.rows[0].corp_id : null;

  const result = await pool.query(
    `SELECT m.*,
            sender.corp_name as sender_corp_name,
            recipient.corp_name as recipient_corp_name
     FROM messages m
     LEFT JOIN players sender ON m.sender_id = sender.id
     LEFT JOIN players recipient ON m.recipient_id = recipient.id
     WHERE m.id = $1 AND (
       m.sender_id = $2 
       OR m.recipient_id = $2 
       OR m.message_type = 'BROADCAST'
       OR (m.message_type = 'CORPORATE' AND m.corp_id = $3)
     )`,
    [messageId, playerId, corpId]
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

  // Handle broadcasts and corporate messages (shared channel messages)
  if (msg.message_type === 'BROADCAST' || msg.message_type === 'CORPORATE') {
    // If the sender is deleting their own message (from Sent), mark as deleted by sender
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
 * Get detailed unread counts for all channels
 */
export async function getUnreadCounts(playerId: number): Promise<{ inbox: number; broadcasts: number; corporate: number }> {
  // Get player info
  const playerResult = await pool.query(
    `SELECT p.universe_id, p.created_at, cm.corp_id
     FROM players p
     LEFT JOIN corp_members cm ON p.id = cm.player_id
     WHERE p.id = $1`,
    [playerId]
  );

  if (playerResult.rows.length === 0) {
    return { inbox: 0, broadcasts: 0, corporate: 0 };
  }

  const { universe_id, created_at: player_joined_at, corp_id } = playerResult.rows[0];

  // Count unread inbox messages
  const inboxResult = await pool.query(
    `SELECT COUNT(*) as count FROM messages
     WHERE recipient_id = $1 AND is_read = FALSE AND is_deleted_by_recipient = FALSE AND message_type = 'DIRECT'`,
    [playerId]
  );

  // Count unread broadcasts (messages after player joined, not deleted, not read by this player)
  const broadcastResult = await pool.query(
    `SELECT COUNT(*) as count FROM messages m
     LEFT JOIN message_deletions md ON m.id = md.message_id AND md.player_id = $3
     LEFT JOIN message_reads mr ON m.id = mr.message_id AND mr.player_id = $3
     WHERE m.universe_id = $1
       AND m.message_type = 'BROADCAST'
       AND m.sent_at >= $2
       AND md.message_id IS NULL
       AND mr.message_id IS NULL
       AND NOT (m.sender_id = $3 AND m.is_deleted_by_sender = TRUE)`,
    [universe_id, player_joined_at, playerId]
  );

  // Count unread corporate messages (if in a corp)
  let corporateCount = 0;
  if (corp_id) {
    const corpResult = await pool.query(
      `SELECT COUNT(*) as count FROM messages m
       LEFT JOIN message_deletions md ON m.id = md.message_id AND md.player_id = $2
       LEFT JOIN message_reads mr ON m.id = mr.message_id AND mr.player_id = $2
       WHERE m.corp_id = $1
         AND m.message_type = 'CORPORATE'
         AND md.message_id IS NULL
         AND mr.message_id IS NULL
         AND NOT (m.sender_id = $2 AND m.is_deleted_by_sender = TRUE)`,
      [corp_id, playerId]
    );
    corporateCount = parseInt(corpResult.rows[0].count, 10);
  }

  return {
    inbox: parseInt(inboxResult.rows[0].count, 10),
    broadcasts: parseInt(broadcastResult.rows[0].count, 10),
    corporate: corporateCount
  };
}

/**
 * Mark all broadcasts as read for a player
 */
export async function markBroadcastsAsRead(playerId: number): Promise<void> {
  // Get player's universe and join time
  const playerResult = await pool.query(
    `SELECT universe_id, created_at FROM players WHERE id = $1`,
    [playerId]
  );

  if (playerResult.rows.length === 0) return;

  const { universe_id, created_at: player_joined_at } = playerResult.rows[0];

  // Insert read records for all unread broadcasts
  await pool.query(
    `INSERT INTO message_reads (player_id, message_id)
     SELECT $1, m.id FROM messages m
     LEFT JOIN message_deletions md ON m.id = md.message_id AND md.player_id = $1
     LEFT JOIN message_reads mr ON m.id = mr.message_id AND mr.player_id = $1
     WHERE m.universe_id = $2
       AND m.message_type = 'BROADCAST'
       AND m.sent_at >= $3
       AND md.message_id IS NULL
       AND mr.message_id IS NULL
       AND NOT (m.sender_id = $1 AND m.is_deleted_by_sender = TRUE)
     ON CONFLICT (player_id, message_id) DO NOTHING`,
    [playerId, universe_id, player_joined_at]
  );
}

/**
 * Mark all corporate messages as read for a player
 */
export async function markCorporateAsRead(playerId: number): Promise<void> {
  // Get player's corp
  const corpResult = await pool.query(
    `SELECT cm.corp_id FROM corp_members cm WHERE cm.player_id = $1`,
    [playerId]
  );

  if (corpResult.rows.length === 0) return;

  const { corp_id } = corpResult.rows[0];

  // Insert read records for all unread corporate messages
  await pool.query(
    `INSERT INTO message_reads (player_id, message_id)
     SELECT $1, m.id FROM messages m
     LEFT JOIN message_deletions md ON m.id = md.message_id AND md.player_id = $1
     LEFT JOIN message_reads mr ON m.id = mr.message_id AND mr.player_id = $1
     WHERE m.corp_id = $2
       AND m.message_type = 'CORPORATE'
       AND md.message_id IS NULL
       AND mr.message_id IS NULL
       AND NOT (m.sender_id = $1 AND m.is_deleted_by_sender = TRUE)
     ON CONFLICT (player_id, message_id) DO NOTHING`,
    [playerId, corp_id]
  );
}

/**
 * Get player's corporation info including member count
 */
export async function getPlayerCorporation(playerId: number): Promise<{ id: number; name: string; memberCount: number } | null> {
  const result = await pool.query(
    `SELECT c.id, c.name, (SELECT COUNT(*) FROM corp_members WHERE corp_id = c.id) as member_count
     FROM corp_members cm
     JOIN corporations c ON cm.corp_id = c.id
     WHERE cm.player_id = $1`,
    [playerId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return { 
    id: result.rows[0].id, 
    name: result.rows[0].name,
    memberCount: parseInt(result.rows[0].member_count, 10)
  };
}

/**
 * Get corporate messages for a player's corporation
 */
export async function getCorporateMessages(playerId: number): Promise<Message[]> {
  // Get player's corp
  const corpResult = await pool.query(
    `SELECT cm.corp_id FROM corp_members cm WHERE cm.player_id = $1`,
    [playerId]
  );

  if (corpResult.rows.length === 0) {
    return [];
  }

  const { corp_id } = corpResult.rows[0];

  const result = await pool.query(
    `SELECT m.*, p.corp_name as sender_corp_name, u.username as sender_username
     FROM messages m
     LEFT JOIN players p ON m.sender_id = p.id
     LEFT JOIN users u ON p.user_id = u.id
     LEFT JOIN message_deletions md ON m.id = md.message_id AND md.player_id = $2
     WHERE m.corp_id = $1
       AND m.message_type = 'CORPORATE'
       AND md.message_id IS NULL
       AND NOT (m.sender_id = $2 AND m.is_deleted_by_sender = TRUE)
     ORDER BY m.sent_at DESC
     LIMIT 100`,
    [corp_id, playerId]
  );

  return result.rows.map(msg => ({
    id: msg.id,
    universe_id: msg.universe_id,
    sender_id: msg.sender_id,
    recipient_id: msg.recipient_id,
    sender_name: msg.sender_name || msg.sender_username || '[Unknown]',
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
 * Get known traders (players you've encountered)
 */
export async function getKnownTraders(playerId: number): Promise<KnownTrader[]> {
  const result = await pool.query(
    `SELECT
       pe.encountered_player_id as player_id,
       u.username as player_name,
       p.corp_name,
       c.name as corporation_name,
       p.ship_type,
       pe.last_met_at,
       pe.encounter_count
     FROM player_encounters pe
     JOIN players p ON pe.encountered_player_id = p.id
     JOIN users u ON p.user_id = u.id
     LEFT JOIN corp_members cm ON p.id = cm.player_id
     LEFT JOIN corporations c ON cm.corp_id = c.id
     WHERE pe.player_id = $1 AND p.is_alive = TRUE
     ORDER BY pe.last_met_at DESC`,
    [playerId]
  );

  return result.rows.map(row => ({
    player_id: row.player_id,
    player_name: row.player_name, // username from users table
    corp_name: row.corporation_name || row.corp_name, // actual corporation name
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
