import { pool } from '../db/connection';
import { broadcastTNN } from './broadcastService';

export const MIN_BOUNTY_AMOUNT = 5000;
export const BOUNTY_EXPIRY_DAYS = 7;
export const LISTING_FEE_RATE = 0.1;

export interface BountyInfo {
  id: number;
  targetPlayerId: number;
  targetName: string;
  placerPlayerId: number;
  placerName: string | null; // null when anonymous
  amount: number;
  signed: boolean;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  lastKnownSector: number | null;
}

export interface BountyBoardEntry {
  targetPlayerId: number;
  targetName: string;
  totalAmount: number;
  contractCount: number;
  lastKnownSector: number | null;
  targetFlagged: boolean;
}

/**
 * Place a bounty on another player. Credits are held in escrow immediately.
 */
export const placeBounty = async (
  placerUserId: number,
  targetPlayerId: number,
  amount: number,
  signed: boolean = false
): Promise<BountyInfo> => {
  if (amount < MIN_BOUNTY_AMOUNT) {
    throw new Error(`Bounty minimum is ${MIN_BOUNTY_AMOUNT} credits`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get placer player and verify credits
    const placerResult = await client.query(
      `SELECT p.id, p.universe_id, p.credits, p.corp_name
       FROM players p WHERE p.user_id = $1`,
      [placerUserId]
    );
    if (placerResult.rows.length === 0) throw new Error('Player not found');
    const placer = placerResult.rows[0];

    if (placer.credits < amount) {
      throw new Error('Not enough credits for this bounty');
    }

    // Verify target exists in the same universe
    const targetResult = await client.query(
      `SELECT id, corp_name, current_sector FROM players WHERE id = $1 AND universe_id = $2`,
      [targetPlayerId, placer.universe_id]
    );
    if (targetResult.rows.length === 0) throw new Error('Target not found');
    if (targetPlayerId === placer.id) throw new Error('Cannot place a bounty on yourself');

    // Target must not already have an active bounty on their head placed by them
    // (self bounty check is covered by the placer != target check above)

    // A player with an active bounty on their head cannot place bounties
    const huntedCheck = await client.query(
      `SELECT id FROM bounties WHERE target_player_id = $1 AND status = 'active' LIMIT 1`,
      [placer.id]
    );
    if (huntedCheck.rows.length > 0) {
      throw new Error('You cannot place bounties while hunted');
    }

    // Hold credits in escrow
    await client.query(
      `UPDATE players SET credits = credits - $1 WHERE id = $2`,
      [amount, placer.id]
    );

    const bountyResult = await client.query(
      `INSERT INTO bounties
         (universe_id, target_player_id, placer_player_id, amount, signed, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       RETURNING *`,
      [placer.universe_id, targetPlayerId, placer.id, amount, signed]
    );

    await client.query('COMMIT');

    const bounty = bountyResult.rows[0];

    // Announce on the news network
    const placerName = signed ? placer.corp_name : 'Anonymous';
    await broadcastTNN(
      placer.universe_id,
      'Bounty Posted',
      `${placerName} has placed a ${amount.toLocaleString()} credit bounty on ${targetResult.rows[0].corp_name}.`
    ).catch(() => undefined);

    return toBountyInfo(bounty, targetResult.rows[0].corp_name, signed ? placer.corp_name : null);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get the public bounty board: active bounties grouped by target.
 * Last known sector is stale intel by design.
 */
export const getBountyBoard = async (userId: number): Promise<BountyBoardEntry[]> => {
  const playerResult = await pool.query(
    'SELECT id, universe_id FROM players WHERE user_id = $1',
    [userId]
  );
  if (playerResult.rows.length === 0) throw new Error('Player not found');
  const universeId = playerResult.rows[0].universe_id;

  const result = await pool.query(
    `SELECT
       b.target_player_id,
       p.corp_name AS target_name,
       SUM(b.amount) AS total_amount,
       COUNT(*) AS contract_count,
       p.current_sector AS last_known_sector,
       (p.flagged_until IS NOT NULL AND p.flagged_until > NOW()) AS target_flagged
     FROM bounties b
     JOIN players p ON p.id = b.target_player_id
     WHERE b.universe_id = $1 AND b.status = 'active'
     GROUP BY b.target_player_id, p.corp_name, p.current_sector, p.flagged_until
     ORDER BY total_amount DESC`,
    [universeId]
  );

  return result.rows.map((row) => ({
    targetPlayerId: row.target_player_id,
    targetName: row.target_name,
    totalAmount: parseInt(row.total_amount, 10),
    contractCount: parseInt(row.contract_count, 10),
    lastKnownSector: row.last_known_sector,
    targetFlagged: !!row.target_flagged,
  }));
};

/**
 * Claim bounties when a player kills another player in combat.
 * Called from the combat resolution path. Returns the total payout.
 */
export const claimBounties = async (
  killerPlayerId: number,
  victimPlayerId: number,
  wasPodded: boolean
): Promise<number> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find active bounties on the victim
    const bountiesResult = await client.query(
      `SELECT * FROM bounties
       WHERE target_player_id = $1 AND status = 'active'
       FOR UPDATE`,
      [victimPlayerId]
    );

    if (bountiesResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return 0;
    }

    let totalPayout = 0;
    const victimIsPlacer = new Set<number>();

    for (const bounty of bountiesResult.rows) {
      // Self placed bounties refund to the placer instead of paying the killer
      if (bounty.placer_player_id === victimPlayerId) {
        victimIsPlacer.add(bounty.id);
        continue;
      }

      // Corp mate kills pay half
      const corpCheck = await client.query(
        `SELECT corp_name FROM players WHERE id IN ($1, $2)`,
        [killerPlayerId, victimPlayerId]
      );
      const corps = corpCheck.rows.map((r: any) => r.corp_name).filter(Boolean);
      const sameCorp = corps.length === 2 && corps[0] === corps[1];
      const corpMultiplier = sameCorp ? 0.5 : 1.0;

      // Podded victims pay half and the bounty stays active
      const podMultiplier = wasPodded ? 0.5 : 1.0;
      const payout = Math.floor(bounty.amount * corpMultiplier * podMultiplier);
      totalPayout += payout;

      if (!wasPodded) {
        await client.query(
          `UPDATE bounties SET status = 'claimed', claimed_by_player_id = $1, claimed_at = NOW()
           WHERE id = $2`,
          [killerPlayerId, bounty.id]
        );
      }
    }

    // Refund self placed bounties to the victim (their escrow returns)
    for (const bountyId of victimIsPlacer) {
      const bounty = bountiesResult.rows.find((b: any) => b.id === bountyId);
      await client.query(
        `UPDATE players SET credits = credits + $1 WHERE id = $2`,
        [bounty.amount, victimPlayerId]
      );
      await client.query(
        `UPDATE bounties SET status = 'refunded' WHERE id = $1`,
        [bountyId]
      );
    }

    // Pay the killer
    if (totalPayout > 0) {
      await client.query(
        `UPDATE players SET credits = credits + $1 WHERE id = $2`,
        [totalPayout, killerPlayerId]
      );

      // Update hunter stats
      await client.query(
        `INSERT INTO bounty_hunters (player_id, bounties_claimed, bounty_credits_earned)
         VALUES ($1, 1, $2)
         ON CONFLICT (player_id)
         DO UPDATE SET
           bounties_claimed = bounty_hunters.bounties_claimed + 1,
           bounty_credits_earned = bounty_hunters.bounty_credits_earned + $2,
           updated_at = NOW()`,
        [killerPlayerId, totalPayout]
      );
    }

    await client.query('COMMIT');

    // Announce the claim
    if (totalPayout > 0) {
      const killerResult = await pool.query(
        'SELECT universe_id, corp_name FROM players WHERE id = $1',
        [killerPlayerId]
      );
      if (killerResult.rows.length > 0) {
        await broadcastTNN(
          killerResult.rows[0].universe_id,
          'Bounty Claimed',
          `${killerResult.rows[0].corp_name} collected ${totalPayout.toLocaleString()} credits in bounties.`
        ).catch(() => undefined);
      }
    }

    return totalPayout;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Expire bounties past their expiry. Escrow returns to placer minus listing fee.
 */
export const expireBounties = async (): Promise<number> => {
  const client = await pool.connect();
  try {
    const expired = await client.query(
      `SELECT * FROM bounties WHERE status = 'active' AND expires_at < NOW() FOR UPDATE`
    );

    for (const bounty of expired.rows) {
      const refund = Math.floor(bounty.amount * (1 - LISTING_FEE_RATE));
      await client.query(
        `UPDATE players SET credits = credits + $1 WHERE id = $2`,
        [refund, bounty.placer_player_id]
      );
      await client.query(
        `UPDATE bounties SET status = 'expired' WHERE id = $1`,
        [bounty.id]
      );
    }

    return expired.rows.length;
  } finally {
    client.release();
  }
};

/**
 * Get hunter leaderboard.
 */
export const getHunterLeaderboard = async (userId: number): Promise<any[]> => {
  const playerResult = await pool.query(
    'SELECT universe_id FROM players WHERE user_id = $1',
    [userId]
  );
  if (playerResult.rows.length === 0) throw new Error('Player not found');

  const result = await pool.query(
    `SELECT p.corp_name, bh.bounties_claimed, bh.bounty_credits_earned
     FROM bounty_hunters bh
     JOIN players p ON p.id = bh.player_id
     WHERE p.universe_id = $1
     ORDER BY bh.bounty_credits_earned DESC
     LIMIT 25`,
    [playerResult.rows[0].universe_id]
  );

  return result.rows;
};

const toBountyInfo = (bounty: any, targetName: string, placerName: string | null): BountyInfo => ({
  id: bounty.id,
  targetPlayerId: bounty.target_player_id,
  targetName,
  placerPlayerId: bounty.placer_player_id,
  placerName,
  amount: bounty.amount,
  signed: bounty.signed,
  status: bounty.status,
  createdAt: bounty.created_at,
  expiresAt: bounty.expires_at,
  lastKnownSector: null,
});
