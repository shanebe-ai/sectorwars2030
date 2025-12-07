import { query, getClient } from '../db/connection';

export interface BankAccount {
  id: number;
  universe_id: number;
  account_type: 'personal' | 'corporate';
  player_id: number | null;
  corp_id: number | null;
  balance: number;
  created_at: Date;
  updated_at: Date;
}

export interface BankTransaction {
  id: number;
  universe_id: number;
  account_id: number;
  transaction_type: 'deposit' | 'withdraw' | 'transfer_in' | 'transfer_out';
  amount: number;
  balance_before: number;
  balance_after: number;
  related_account_id: number | null;
  related_player_name: string | null;
  related_corp_name: string | null;
  memo: string | null;
  created_at: Date;
}

/**
 * Get or create a personal bank account for a player
 */
export async function getOrCreatePersonalAccount(playerId: number, universeId: number): Promise<BankAccount> {
  // Try to get existing account
  const existingAccount = await query(
    'SELECT * FROM bank_accounts WHERE player_id = $1 AND account_type = $2',
    [playerId, 'personal']
  );

  if (existingAccount.rows.length > 0) {
    return existingAccount.rows[0];
  }

  // Create new account
  const newAccount = await query(
    `INSERT INTO bank_accounts (universe_id, account_type, player_id, balance)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [universeId, 'personal', playerId, 0]
  );

  return newAccount.rows[0];
}

/**
 * Get or create a corporate bank account for a corporation
 */
export async function getOrCreateCorporateAccount(corpId: number, universeId: number): Promise<BankAccount> {
  // Try to get existing account
  const existingAccount = await query(
    'SELECT * FROM bank_accounts WHERE corp_id = $1 AND account_type = $2',
    [corpId, 'corporate']
  );

  if (existingAccount.rows.length > 0) {
    return existingAccount.rows[0];
  }

  // Create new account
  const newAccount = await query(
    `INSERT INTO bank_accounts (universe_id, account_type, corp_id, balance)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [universeId, 'corporate', corpId, 0]
  );

  return newAccount.rows[0];
}

/**
 * Get bank account balances for a player (personal + corporate if applicable)
 */
export async function getPlayerBankAccounts(playerId: number) {
  const result = await query(
    `SELECT ba.*, c.name as corp_name, cm.corp_id
     FROM bank_accounts ba
     LEFT JOIN corp_members cm ON cm.player_id = $1 AND ba.corp_id = cm.corp_id
     LEFT JOIN corporations c ON c.id = ba.corp_id
     WHERE ba.player_id = $1 OR ba.corp_id = cm.corp_id
     ORDER BY ba.account_type`,
    [playerId]
  );

  return result.rows;
}

/**
 * Deposit credits to bank account (from player's on-hand credits)
 * Requires player to be at a StarDock
 */
export async function depositCredits(
  playerId: number,
  accountType: 'personal' | 'corporate',
  amount: number
): Promise<{ success: boolean; error?: string; transaction?: BankTransaction }> {
  if (amount <= 0) {
    return { success: false, error: 'Amount must be greater than 0' };
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get player's current credits and location
    const playerResult = await client.query(
      `SELECT p.credits, p.universe_id, p.current_sector, s.port_type
       FROM players p
       JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
       WHERE p.id = $1`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Player not found' };
    }

    const player = playerResult.rows[0];
    const universeId = player.universe_id;

    // Check if player is at a StarDock
    if (player.port_type !== 'STARDOCK') {
      await client.query('ROLLBACK');
      return { success: false, error: 'You must be at a StarDock to use banking services' };
    }

    if (player.credits < amount) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Insufficient credits' };
    }

    // Get or create the appropriate account
    let account: BankAccount;
    if (accountType === 'personal') {
      account = await getOrCreatePersonalAccount(playerId, universeId);
    } else {
      // Get player's corporation
      const corpResult = await client.query(
        'SELECT corp_id FROM corp_members WHERE player_id = $1',
        [playerId]
      );

      if (corpResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Player is not in a corporation' };
      }

      const corpId = corpResult.rows[0].corp_id;
      account = await getOrCreateCorporateAccount(corpId, universeId);
    }

    // Parse balance as number (PostgreSQL returns NUMERIC as string)
    const balanceBefore = parseInt(String(account.balance), 10) || 0;
    const balanceAfter = balanceBefore + amount;

    // Update player credits
    await client.query(
      'UPDATE players SET credits = credits - $1 WHERE id = $2',
      [amount, playerId]
    );

    // Update bank account balance
    await client.query(
      'UPDATE bank_accounts SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [balanceAfter, account.id]
    );

    // Create transaction record
    const transactionResult = await client.query(
      `INSERT INTO bank_transactions (universe_id, account_id, transaction_type, amount, balance_before, balance_after)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [universeId, account.id, 'deposit', amount, balanceBefore, balanceAfter]
    );

    await client.query('COMMIT');

    return { success: true, transaction: transactionResult.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error depositing credits:', error);
    return { success: false, error: 'Failed to deposit credits' };
  } finally {
    client.release();
  }
}

/**
 * Withdraw credits from bank account (to player's on-hand credits)
 * Requires player to be at a StarDock
 * Charges 5% withdrawal fee
 */
export async function withdrawCredits(
  playerId: number,
  accountType: 'personal' | 'corporate',
  amount: number
): Promise<{ success: boolean; error?: string; transaction?: BankTransaction }> {
  if (amount <= 0) {
    return { success: false, error: 'Amount must be greater than 0' };
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get player's universe and location
    const playerResult = await client.query(
      `SELECT p.universe_id, p.current_sector, s.port_type
       FROM players p
       JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
       WHERE p.id = $1`,
      [playerId]
    );

    if (playerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Player not found' };
    }

    const player = playerResult.rows[0];
    const universeId = player.universe_id;

    // Check if player is at a StarDock
    if (player.port_type !== 'STARDOCK') {
      await client.query('ROLLBACK');
      return { success: false, error: 'You must be at a StarDock to use banking services' };
    }

    // Get the appropriate account
    let account: BankAccount;
    if (accountType === 'personal') {
      account = await getOrCreatePersonalAccount(playerId, universeId);
    } else {
      // Get player's corporation and rank
      const corpResult = await client.query(
        `SELECT cm.corp_id, cm.rank, c.founder_id
         FROM corp_members cm
         JOIN corporations c ON cm.corp_id = c.id
         WHERE cm.player_id = $1`,
        [playerId]
      );

      if (corpResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Player is not in a corporation' };
      }

      const corp = corpResult.rows[0];
      const corpId = corp.corp_id;
      const rank = corp.rank || 'member';
      const isFounder = corp.founder_id === playerId;

      // Check withdrawal permissions: Founder = unlimited, Officer = ₡100K/day, Member = ₡10K/day
      if (!isFounder && rank !== 'founder') {
        if (rank === 'member' && amount > 10000) {
          await client.query('ROLLBACK');
          return { success: false, error: 'Members can only withdraw up to ₡10,000 per transaction from corporate accounts' };
        }
        if (rank === 'officer' && amount > 100000) {
          await client.query('ROLLBACK');
          return { success: false, error: 'Officers can only withdraw up to ₡100,000 per transaction from corporate accounts' };
        }
      }

      account = await getOrCreateCorporateAccount(corpId, universeId);
    }

    // Parse balance as number (PostgreSQL returns NUMERIC as string)
    const balanceBefore = parseInt(String(account.balance), 10) || 0;

    if (balanceBefore < amount) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Insufficient funds in bank account' };
    }

    // Calculate withdrawal fee (5%)
    const withdrawalFee = Math.floor(amount * 0.05);
    const amountAfterFee = amount - withdrawalFee;
    const balanceAfter = balanceBefore - amount;

    // Update player credits (receive amount minus fee)
    await client.query(
      'UPDATE players SET credits = credits + $1 WHERE id = $2',
      [amountAfterFee, playerId]
    );

    // Update bank account balance
    await client.query(
      'UPDATE bank_accounts SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [balanceAfter, account.id]
    );

    // Create transaction record (include fee in memo)
    const transactionResult = await client.query(
      `INSERT INTO bank_transactions (universe_id, account_id, transaction_type, amount, balance_before, balance_after, memo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [universeId, account.id, 'withdraw', amount, balanceBefore, balanceAfter, 
       withdrawalFee > 0 ? `Withdrawal fee: ₡${withdrawalFee.toLocaleString()}` : null]
    );

    await client.query('COMMIT');

    return { success: true, transaction: transactionResult.rows[0] };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error withdrawing credits:', error);
    return { success: false, error: 'Failed to withdraw credits' };
  } finally {
    client.release();
  }
}

/**
 * Transfer credits to another player's personal account
 * Requires sender to be at a StarDock
 */
export async function transferCredits(
  senderPlayerId: number,
  recipientPlayerId: number,
  amount: number,
  memo?: string
): Promise<{ success: boolean; error?: string }> {
  if (amount <= 0) {
    return { success: false, error: 'Amount must be greater than 0' };
  }

  if (senderPlayerId === recipientPlayerId) {
    return { success: false, error: 'Cannot transfer to yourself' };
  }

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Get sender's personal account, location, and username
    const senderPlayerResult = await client.query(
      `SELECT p.universe_id, p.corp_name, p.current_sector, s.port_type, u.username
       FROM players p
       JOIN users u ON p.user_id = u.id
       JOIN sectors s ON s.universe_id = p.universe_id AND s.sector_number = p.current_sector
       WHERE p.id = $1`,
      [senderPlayerId]
    );

    if (senderPlayerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Sender not found' };
    }

    const senderPlayer = senderPlayerResult.rows[0];
    const universeId = senderPlayer.universe_id;
    const senderName = senderPlayer.corp_name || senderPlayer.username || 'Unknown';

    // Check if sender is at a StarDock
    if (senderPlayer.port_type !== 'STARDOCK') {
      await client.query('ROLLBACK');
      return { success: false, error: 'You must be at a StarDock to use banking services' };
    }

    const senderAccount = await getOrCreatePersonalAccount(senderPlayerId, universeId);

    // Parse balance as number (PostgreSQL returns NUMERIC as string)
    const senderCurrentBalance = parseInt(String(senderAccount.balance), 10) || 0;
    if (senderCurrentBalance < amount) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Insufficient funds in your personal account' };
    }

    // Get recipient's personal account
    const recipientPlayerResult = await client.query(
      `SELECT p.universe_id, p.corp_name, u.username
       FROM players p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [recipientPlayerId]
    );

    if (recipientPlayerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Recipient not found' };
    }

    const recipientPlayer = recipientPlayerResult.rows[0];
    const recipientName = recipientPlayer.corp_name || recipientPlayer.username || 'Unknown';
    const recipientUsername = recipientPlayer.username || 'Unknown';
    const senderUsername = senderPlayer.username || 'Unknown';

    // Ensure they're in the same universe
    if (senderPlayer.universe_id !== recipientPlayer.universe_id) {
      await client.query('ROLLBACK');
      return { success: false, error: 'Cannot transfer to players in different universes' };
    }

    const recipientAccount = await getOrCreatePersonalAccount(recipientPlayerId, universeId);

    // Perform the transfer (parse balances as numbers - PostgreSQL returns NUMERIC as string)
    const senderBalanceBefore = parseInt(String(senderAccount.balance), 10) || 0;
    const senderBalanceAfter = senderBalanceBefore - amount;

    const recipientBalanceBefore = parseInt(String(recipientAccount.balance), 10) || 0;
    const recipientBalanceAfter = recipientBalanceBefore + amount;

    // Update sender account
    await client.query(
      'UPDATE bank_accounts SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [senderBalanceAfter, senderAccount.id]
    );

    // Update recipient account
    await client.query(
      'UPDATE bank_accounts SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [recipientBalanceAfter, recipientAccount.id]
    );

    // Create sender transaction record
    await client.query(
      `INSERT INTO bank_transactions (universe_id, account_id, transaction_type, amount, balance_before, balance_after,
        related_account_id, related_player_name, memo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [universeId, senderAccount.id, 'transfer_out', amount, senderBalanceBefore, senderBalanceAfter,
        recipientAccount.id, recipientName, memo]
    );

    // Create recipient transaction record
    await client.query(
      `INSERT INTO bank_transactions (universe_id, account_id, transaction_type, amount, balance_before, balance_after,
        related_account_id, related_player_name, memo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [universeId, recipientAccount.id, 'transfer_in', amount, recipientBalanceBefore, recipientBalanceAfter,
        senderAccount.id, senderName, memo]
    );

    // Send inbox receipts
    await client.query(
      `INSERT INTO messages (
         recipient_id,
         sender_name,
         subject,
         body,
         message_type,
         is_read
       ) VALUES ($1, 'SYSTEM', $2, $3, 'DIRECT', FALSE)`,
      [
        recipientPlayerId,
        'Funds Received',
        `You received ₡${amount.toLocaleString()} from ${senderUsername}.${memo ? ` Memo: ${memo}` : ''}`
      ]
    );

    await client.query(
      `INSERT INTO messages (
         recipient_id,
         sender_name,
         subject,
         body,
         message_type,
         is_read
       ) VALUES ($1, 'SYSTEM', $2, $3, 'DIRECT', FALSE)`,
      [
        senderPlayerId,
        'Transfer Sent',
        `You sent ₡${amount.toLocaleString()} to ${recipientUsername}.${memo ? ` Memo: ${memo}` : ''}`
      ]
    );

    await client.query('COMMIT');

    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error transferring credits:', error);
    return { success: false, error: 'Failed to transfer credits' };
  } finally {
    client.release();
  }
}

/**
 * Get transaction history for a bank account
 */
export async function getTransactionHistory(
  accountId: number,
  limit: number = 50,
  offset: number = 0
): Promise<BankTransaction[]> {
  const result = await query(
    `SELECT * FROM bank_transactions
     WHERE account_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [accountId, limit, offset]
  );

  return result.rows;
}

/**
 * Search for players by name (for transfer feature)
 */
export async function searchPlayers(universeId: number, searchTerm: string): Promise<any[]> {
  const result = await query(
    `SELECT p.id, u.username as name
     FROM players p
     JOIN users u ON p.user_id = u.id
     WHERE p.universe_id = $1
       AND u.username ILIKE $2
     ORDER BY u.username
     LIMIT 20`,
    [universeId, `%${searchTerm}%`]
  );

  return result.rows;
}
