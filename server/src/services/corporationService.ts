/**
 * Corporation Service
 * Handles corporation management operations
 */

import { pool } from '../db/connection';
import { emitUniverseEvent } from '../index';

/**
 * Get corporation details including all members
 */
export async function getCorporationDetails(corpId: number) {
  const client = await pool.connect();

  try {
    // Get corporation info
    const corpResult = await client.query(`
      SELECT c.*, u.username as founder_username
      FROM corporations c
      LEFT JOIN players p ON c.founder_id = p.id
      LEFT JOIN users u ON p.user_id = u.id
      WHERE c.id = $1
    `, [corpId]);

    if (corpResult.rows.length === 0) {
      throw new Error('Corporation not found');
    }

    const corp = corpResult.rows[0];

    // Get all members
    const membersResult = await client.query(`
      SELECT
        cm.id as member_id,
        cm.rank,
        cm.joined_at,
        p.id as player_id,
        u.username,
        p.ship_type,
        p.alignment,
        p.kills,
        p.deaths,
        p.credits,
        u.email
      FROM corp_members cm
      JOIN players p ON cm.player_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE cm.corp_id = $1
      ORDER BY
        CASE cm.rank
          WHEN 'founder' THEN 1
          WHEN 'officer' THEN 2
          WHEN 'member' THEN 3
        END,
        cm.joined_at ASC
    `, [corpId]);

    return {
      id: corp.id,
      name: corp.name,
      founderId: corp.founder_id,
      founderUsername: corp.founder_username,
      universeId: corp.universe_id,
      createdAt: corp.created_at,
      members: membersResult.rows.map(m => ({
        memberId: m.member_id,
        playerId: m.player_id,
        username: m.username,
        email: m.email,
        rank: m.rank,
        shipType: m.ship_type,
        alignment: m.alignment,
        kills: m.kills,
        deaths: m.deaths,
        credits: parseInt(m.credits),
        joinedAt: m.joined_at
      }))
    };
  } finally {
    client.release();
  }
}

/**
 * Helper function to send corporate broadcast message (single shared message per corp)
 */
async function sendCorporateBroadcast(
  client: any,
  corpId: number,
  message: string,
  universeId?: number,
  corpNameOverride?: string
) {
  let corpUniverseId = universeId;
  let corpName = corpNameOverride;

  if (corpUniverseId === undefined || corpName === undefined) {
    const corpResult = await client.query(
      `SELECT universe_id, name FROM corporations WHERE id = $1`,
      [corpId]
    );
    const corpRow = corpResult.rows[0] || {};
    if (corpUniverseId === undefined) {
      corpUniverseId = corpRow.universe_id ?? null;
    }
    if (corpName === undefined) {
      corpName = corpRow.name ?? 'CORPORATE';
    }
  }

  const insertResult = await client.query(
    `INSERT INTO messages (
       universe_id,
       recipient_id,
       sender_name,
       subject,
       body,
       message_type,
       corp_id,
       is_read
     )
     VALUES ($1, NULL, $2, 'Corporate Update', $3, 'CORPORATE', $4, FALSE)`,
    [corpUniverseId, corpName || 'CORPORATE', message, corpId]
  );

  // Emit websocket event so COMMS badge updates
  if (corpUniverseId !== null && corpUniverseId !== undefined && insertResult.rowCount > 0) {
    emitUniverseEvent(corpUniverseId, 'new_broadcast', {
      sender: corpName || 'CORPORATE',
      subject: 'Corporate Update',
      body: message,
      timestamp: new Date().toISOString(),
      corpId
    });
  }
}

/**
 * Helper to create a universe-wide broadcast from TNN
 */
async function sendUniverseBroadcast(
  client: any,
  universeId: number,
  subject: string,
  body: string
) {
  const insertResult = await client.query(
    `INSERT INTO messages (
       universe_id,
       sender_id,
       recipient_id,
       sender_name,
       subject,
       body,
       message_type
     )
     VALUES ($1, NULL, NULL, 'TerraCorp News Network', $2, $3, 'BROADCAST')`,
    [universeId, subject, body]
  );

  if (insertResult.rowCount > 0) {
    emitUniverseEvent(universeId, 'new_broadcast', {
      sender: 'TerraCorp News Network',
      subject,
      body,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Leave corporation (player leaves their corp)
 */
export async function leaveCorporation(playerId: number) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let pendingBroadcast: { universeId: number; subject: string; body: string } | null = null;

    // Get player's corp membership and username
    const memberResult = await client.query(`
      SELECT cm.*, c.founder_id, c.name as corp_name, c.universe_id, u.username
      FROM corp_members cm
      JOIN corporations c ON cm.corp_id = c.id
      JOIN players p ON cm.player_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE cm.player_id = $1
    `, [playerId]);

    if (memberResult.rows.length === 0) {
      throw new Error('You are not in a corporation');
    }

    const membership = memberResult.rows[0];

    // Check if player is the founder
    if (membership.founder_id === playerId) {
      throw new Error('Founder cannot leave. Transfer ownership first or disband the corporation.');
    }

    const corpId = membership.corp_id;
    const username = membership.username;
    const universeId = membership.universe_id;
    const corpName = membership.corp_name;

    // Broadcast to corporate channel
    await sendCorporateBroadcast(
      client,
      corpId,
      `${username} has left the corporation`,
      universeId,
      corpName
    );

    // Universe-wide broadcast
    const leaveBroadcastBody = `${username} has left ${membership.corp_name}`;
    await sendUniverseBroadcast(
      client,
      universeId,
      'Corporate Update',
      leaveBroadcastBody
    );
    pendingBroadcast = { universeId, subject: 'Corporate Update', body: leaveBroadcastBody };

    // Remove from corp_members
    await client.query(`
      DELETE FROM corp_members WHERE player_id = $1
    `, [playerId]);

    // Remove visibility of prior corporate messages for this player
    await client.query(
      `INSERT INTO message_deletions (message_id, player_id)
       SELECT m.id, $2
       FROM messages m
       WHERE m.corp_id = $1
       ON CONFLICT (message_id, player_id) DO NOTHING`,
      [corpId, playerId]
    );

    // Update player record
    await client.query(`
      UPDATE players
      SET corp_id = NULL, corp_name = NULL
      WHERE id = $1
    `, [playerId]);

    await client.query('COMMIT');

    if (pendingBroadcast) {
      emitUniverseEvent(pendingBroadcast.universeId, 'new_broadcast', {
        sender: 'TerraCorp News Network',
        subject: pendingBroadcast.subject,
        body: pendingBroadcast.body,
        timestamp: new Date().toISOString()
      });
    }

    return {
      success: true,
      message: `You have left ${membership.corp_name}`,
      corpName: membership.corp_name
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Invite player to corporation
 */
export async function invitePlayer(inviterId: number, targetUsername: string) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get inviter's corp membership and rank
    const inviterResult = await client.query(`
      SELECT cm.corp_id, cm.rank, c.name as corp_name, c.universe_id
      FROM corp_members cm
      JOIN corporations c ON cm.corp_id = c.id
      WHERE cm.player_id = $1
    `, [inviterId]);

    if (inviterResult.rows.length === 0) {
      throw new Error('You are not in a corporation');
    }

    const inviterMembership = inviterResult.rows[0];

    // Check if inviter has permission (founder or officer)
    if (inviterMembership.rank !== 'founder' && inviterMembership.rank !== 'officer') {
      throw new Error('Only founders and officers can invite players');
    }

    // Find target player by username in the same universe
    const targetResult = await client.query(`
      SELECT p.*, u.username
      FROM players p
      JOIN users u ON p.user_id = u.id
      WHERE LOWER(u.username) = LOWER($1) AND p.universe_id = $2
    `, [targetUsername, inviterMembership.universe_id]);

    if (targetResult.rows.length === 0) {
      throw new Error(`Player "${targetUsername}" not found in this universe`);
    }

    const targetPlayer = targetResult.rows[0];

    // Prevent inviting yourself
    if (targetPlayer.id === inviterId) {
      throw new Error('You cannot invite yourself to your own corporation');
    }

    // Note: We allow inviting players already in a corp
    // They must leave their current corp before accepting the invitation

    // Get founder information
    const founderResult = await client.query(`
      SELECT u.username
      FROM corporations c
      JOIN players p ON c.founder_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE c.id = $1
    `, [inviterMembership.corp_id]);

    const founderName = founderResult.rows.length > 0 ? founderResult.rows[0].username : 'Unknown';

    // Create invitation (store in messages as a special type)
    await client.query(`
      INSERT INTO messages (
        recipient_id,
        sender_name,
        subject,
        body,
        message_type,
        is_read
      ) VALUES ($1, $2, $3, $4, 'corp_invite', false)
    `, [
      targetPlayer.id,
      inviterMembership.corp_name,
      'Corporation Invitation',
      `You have been invited to join ${inviterMembership.corp_name}.\n\nFounder: ${founderName}\n\nAccept this invitation to become a member of this corporation.\n\n[CORP_ID:${inviterMembership.corp_id}]`
    ]);

    await client.query('COMMIT');

    return {
      success: true,
      message: `Invitation sent to ${targetUsername}`,
      targetPlayer: targetUsername,
      corpName: inviterMembership.corp_name
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Accept corporation invitation
 */
export async function acceptInvitation(playerId: number, corpId: number) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let pendingBroadcast: { universeId: number; subject: string; body: string } | null = null;

    // Verify player is not already in a corp and get username
    const playerResult = await client.query(`
      SELECT p.corp_id, u.username, p.universe_id
      FROM players p
      JOIN users u ON p.user_id = u.id
      WHERE p.id = $1
    `, [playerId]);

    if (playerResult.rows[0].corp_id) {
      throw new Error('You are already in a corporation');
    }

    const username = playerResult.rows[0].username;
    const universeId = playerResult.rows[0].universe_id;

    // Get corporation details
    const corpResult = await client.query(`
      SELECT name, universe_id FROM corporations WHERE id = $1
    `, [corpId]);

    if (corpResult.rows.length === 0) {
      throw new Error('Corporation not found');
    }

    const corpName = corpResult.rows[0].name;
    const corpUniverseId = corpResult.rows[0].universe_id;

    // Add to corp_members
    await client.query(`
      INSERT INTO corp_members (corp_id, player_id, rank)
      VALUES ($1, $2, 'member')
    `, [corpId, playerId]);

    // Update player record
    await client.query(`
      UPDATE players
      SET corp_id = $1, corp_name = $2
      WHERE id = $3
    `, [corpId, corpName, playerId]);

    // Broadcast to corporate channel (send to all members INCLUDING the new joiner)
    await sendCorporateBroadcast(
      client,
      corpId,
      `${username} has joined the corporation`,
      corpUniverseId,
      corpName
    );

    // Broadcast to universe (all players in same universe)
    const joinBroadcastBody = `${username} has joined ${corpName}`;
    await sendUniverseBroadcast(
      client,
      corpUniverseId ?? universeId,
      'Corporate Update',
      joinBroadcastBody
    );
    pendingBroadcast = {
      universeId: corpUniverseId ?? universeId,
      subject: 'Corporate Update',
      body: joinBroadcastBody
    };

    await client.query('COMMIT');

    if (pendingBroadcast) {
      emitUniverseEvent(pendingBroadcast.universeId, 'new_broadcast', {
        sender: 'TerraCorp News Network',
        subject: pendingBroadcast.subject,
        body: pendingBroadcast.body,
        timestamp: new Date().toISOString()
      });
    }

    return {
      success: true,
      message: `You have joined ${corpName}!`,
      corpId,
      corpName
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Kick member from corporation
 */
export async function kickMember(kickerId: number, targetPlayerId: number) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get kicker's corp membership and rank with username
    const kickerResult = await client.query(`
      SELECT cm.corp_id, cm.rank, c.name as corp_name, c.founder_id, c.universe_id, u.username as kicker_username
      FROM corp_members cm
      JOIN corporations c ON cm.corp_id = c.id
      JOIN players p ON cm.player_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE cm.player_id = $1
    `, [kickerId]);

    if (kickerResult.rows.length === 0) {
      throw new Error('You are not in a corporation');
    }

    const kickerMembership = kickerResult.rows[0];

    // Check if kicker has permission (founder or officer)
    if (kickerMembership.rank !== 'founder' && kickerMembership.rank !== 'officer') {
      throw new Error('Only founders and officers can kick members');
    }

    // Get target's corp membership
    const targetResult = await client.query(`
      SELECT cm.*, u.username
      FROM corp_members cm
      JOIN players p ON cm.player_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE cm.player_id = $1 AND cm.corp_id = $2
    `, [targetPlayerId, kickerMembership.corp_id]);

    if (targetResult.rows.length === 0) {
      throw new Error('Player is not in your corporation');
    }

    const targetMembership = targetResult.rows[0];

    // Cannot kick founder
    if (targetPlayerId === kickerMembership.founder_id) {
      throw new Error('Cannot kick the founder');
    }

    // Officers can only kick members, not other officers
    if (kickerMembership.rank === 'officer' && targetMembership.rank === 'officer') {
      throw new Error('Officers cannot kick other officers');
    }

    // Broadcast to corporate channel BEFORE removing them
    await sendCorporateBroadcast(
      client,
      kickerMembership.corp_id,
      `${targetMembership.username} has been removed from ${kickerMembership.corp_name} by ${kickerMembership.kicker_username}`,
      kickerMembership.universe_id,
      kickerMembership.corp_name
    );

    // Remove from corp
    await client.query(`
      DELETE FROM corp_members WHERE player_id = $1
    `, [targetPlayerId]);

    // Remove visibility of prior corporate messages for this player
    await client.query(
      `INSERT INTO message_deletions (message_id, player_id)
       SELECT m.id, $2
       FROM messages m
       WHERE m.corp_id = $1
       ON CONFLICT (message_id, player_id) DO NOTHING`,
      [kickerMembership.corp_id, targetPlayerId]
    );

    // Update player record
    await client.query(`
      UPDATE players
      SET corp_id = NULL, corp_name = NULL
      WHERE id = $1
    `, [targetPlayerId]);

    // Send notification to kicked player
    await client.query(`
      INSERT INTO messages (
        recipient_id,
        sender_name,
        subject,
        body,
        message_type,
        is_read
      ) VALUES ($1, $2, $3, $4, 'inbox', false)
    `, [
      targetPlayerId,
      'SYSTEM',
      'Removed from Corporation',
      `You have been removed from ${kickerMembership.corp_name}.`
    ]);

    await client.query('COMMIT');

    return {
      success: true,
      message: `${targetMembership.username} has been removed from the corporation`,
      targetUsername: targetMembership.username
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Promote or demote member
 */
export async function changeRank(changerId: number, targetPlayerId: number, newRank: 'member' | 'officer') {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get changer's corp membership with username
    const changerResult = await client.query(`
      SELECT cm.corp_id, cm.rank, c.name as corp_name, c.founder_id, c.universe_id, u.username as changer_username
      FROM corp_members cm
      JOIN corporations c ON cm.corp_id = c.id
      JOIN players p ON cm.player_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE cm.player_id = $1
    `, [changerId]);

    if (changerResult.rows.length === 0) {
      throw new Error('You are not in a corporation');
    }

    const changerMembership = changerResult.rows[0];

    // Only founder can promote/demote
    if (changerMembership.rank !== 'founder') {
      throw new Error('Only the founder can change member ranks');
    }

    // Get target's membership
    const targetResult = await client.query(`
      SELECT cm.*, u.username
      FROM corp_members cm
      JOIN players p ON cm.player_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE cm.player_id = $1 AND cm.corp_id = $2
    `, [targetPlayerId, changerMembership.corp_id]);

    if (targetResult.rows.length === 0) {
      throw new Error('Player is not in your corporation');
    }

    const targetMembership = targetResult.rows[0];
    const oldRank = targetMembership.rank;

    // Cannot change founder's rank
    if (targetPlayerId === changerMembership.founder_id) {
      throw new Error('Cannot change founder rank');
    }

    // Update rank
    await client.query(`
      UPDATE corp_members
      SET rank = $1
      WHERE player_id = $2
    `, [newRank, targetPlayerId]);

    // Broadcast to corporate channel
    const action = newRank === 'officer' ? 'promoted to Officer' : 'demoted to Member';
    await sendCorporateBroadcast(
      client,
      changerMembership.corp_id,
      `${targetMembership.username} has been ${action} by ${changerMembership.changer_username}`,
      changerMembership.universe_id,
      changerMembership.corp_name
    );

    // Send notification
    await client.query(`
      INSERT INTO messages (
        recipient_id,
        sender_name,
        subject,
        body,
        message_type,
        is_read
      ) VALUES ($1, $2, $3, $4, 'inbox', false)
    `, [
      targetPlayerId,
      'SYSTEM',
      'Rank Changed',
      `Your rank in ${changerMembership.corp_name} has been changed to ${newRank.toUpperCase()}.`
    ]);

    await client.query('COMMIT');

    return {
      success: true,
      message: `${targetMembership.username} is now a ${newRank}`,
      targetUsername: targetMembership.username,
      newRank
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Transfer ownership to another member
 */
export async function transferOwnership(currentFounderId: number, newFounderId: number) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let pendingBroadcast: { universeId: number; subject: string; body: string } | null = null;

    // Get current founder's corp with username
    const founderResult = await client.query(`
      SELECT cm.corp_id, cm.rank, c.name as corp_name, c.founder_id, c.universe_id, u.username as old_founder_username
      FROM corp_members cm
      JOIN corporations c ON cm.corp_id = c.id
      JOIN players p ON cm.player_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE cm.player_id = $1
    `, [currentFounderId]);

    if (founderResult.rows.length === 0) {
      throw new Error('You are not in a corporation');
    }

    const founderMembership = founderResult.rows[0];

    // Verify is actually the founder
    if (founderMembership.rank !== 'founder' || founderMembership.founder_id !== currentFounderId) {
      throw new Error('Only the founder can transfer ownership');
    }

    // Get new founder's membership
    const newFounderResult = await client.query(`
      SELECT cm.*, u.username
      FROM corp_members cm
      JOIN players p ON cm.player_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE cm.player_id = $1 AND cm.corp_id = $2
    `, [newFounderId, founderMembership.corp_id]);

    if (newFounderResult.rows.length === 0) {
      throw new Error('Target player is not in your corporation');
    }

    const newFounderMembership = newFounderResult.rows[0];
    const universeId = founderMembership.universe_id;

    // Update corporation founder_id
    await client.query(`
      UPDATE corporations
      SET founder_id = $1
      WHERE id = $2
    `, [newFounderId, founderMembership.corp_id]);

    // Update old founder to officer
    await client.query(`
      UPDATE corp_members
      SET rank = 'officer'
      WHERE player_id = $1
    `, [currentFounderId]);

    // Update new founder rank
    await client.query(`
      UPDATE corp_members
      SET rank = 'founder'
      WHERE player_id = $1
    `, [newFounderId]);

    // Broadcast to corporate channel
    await sendCorporateBroadcast(
      client,
      founderMembership.corp_id,
      `Ownership transferred from ${founderMembership.old_founder_username} to ${newFounderMembership.username}`,
      universeId,
      founderMembership.corp_name
    );

    // Universe-wide broadcast
    const transferBroadcastBody = `Ownership of ${founderMembership.corp_name} transferred from ${founderMembership.old_founder_username} to ${newFounderMembership.username}`;
    await sendUniverseBroadcast(
      client,
      universeId,
      'Corporate Update',
      transferBroadcastBody
    );
    pendingBroadcast = {
      universeId,
      subject: 'Corporate Update',
      body: transferBroadcastBody
    };

    // Send notification to new founder
    await client.query(`
      INSERT INTO messages (
        recipient_id,
        sender_name,
        subject,
        body,
        message_type,
        is_read
      ) VALUES ($1, $2, $3, $4, 'inbox', false)
    `, [
      newFounderId,
      'SYSTEM',
      'Corporation Ownership Transferred',
      `You are now the founder of ${founderMembership.corp_name}!`
    ]);

    await client.query('COMMIT');

    if (pendingBroadcast) {
      emitUniverseEvent(pendingBroadcast.universeId, 'new_broadcast', {
        sender: 'TerraCorp News Network',
        subject: pendingBroadcast.subject,
        body: pendingBroadcast.body,
        timestamp: new Date().toISOString()
      });
    }

    return {
      success: true,
      message: `Ownership transferred to ${newFounderMembership.username}`,
      newFounderUsername: newFounderMembership.username
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Disband corporation (founder only)
 */
export async function disbandCorporation(founderId: number) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get founder's corp
    const founderResult = await client.query(`
      SELECT cm.corp_id, cm.rank, c.name as corp_name, c.founder_id, c.universe_id
      FROM corp_members cm
      JOIN corporations c ON cm.corp_id = c.id
      WHERE cm.player_id = $1
    `, [founderId]);

    if (founderResult.rows.length === 0) {
      throw new Error('You are not in a corporation');
    }

    const founderMembership = founderResult.rows[0];

    // Verify is actually the founder
    if (founderMembership.rank !== 'founder' || founderMembership.founder_id !== founderId) {
      throw new Error('Only the founder can disband the corporation');
    }

    const corpId = founderMembership.corp_id;
    const corpName = founderMembership.corp_name;
    const universeId = founderMembership.universe_id;

    // Get all members to notify them
    const membersResult = await client.query(`
      SELECT player_id
      FROM corp_members
      WHERE corp_id = $1 AND player_id != $2
    `, [corpId, founderId]);

    // Send notifications to all members
    for (const member of membersResult.rows) {
      await client.query(`
        INSERT INTO messages (
          recipient_id,
          sender_name,
          subject,
          body,
          message_type,
          is_read
        ) VALUES ($1, $2, $3, $4, 'inbox', false)
      `, [
        member.player_id,
        'SYSTEM',
        'Corporation Disbanded',
        `${corpName} has been disbanded by the founder. You are no longer a member.`
      ]);
    }

    // Delete all corp members
    await client.query(`
      DELETE FROM corp_members
      WHERE corp_id = $1
    `, [corpId]);

    // Delete the corporation
    await client.query(`
      DELETE FROM corporations
      WHERE id = $1
    `, [corpId]);

    // Universe-wide broadcast (no corp channel exists after disband)
    const disbandBody = `${corpName} has been disbanded by the founder.`;
    await sendUniverseBroadcast(
      client,
      universeId,
      'Corporate Update',
      disbandBody
    );

    await client.query('COMMIT');

    emitUniverseEvent(universeId, 'new_broadcast', {
      sender: 'TerraCorp News Network',
      subject: 'Corporate Update',
      body: disbandBody,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      message: `${corpName} has been disbanded`
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
