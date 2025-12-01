import express from 'express';
import { authenticateToken } from '../middleware/auth';
import * as bankingController from '../controllers/bankingController';

const router = express.Router();

// All banking routes require authentication
router.use(authenticateToken);

// Get player's bank accounts (personal + corporate)
router.get('/', bankingController.getBankAccounts);

// Deposit credits to bank account
router.post('/deposit', bankingController.depositCredits);

// Withdraw credits from bank account
router.post('/withdraw', bankingController.withdrawCredits);

// Transfer credits to another player
router.post('/transfer', bankingController.transferCredits);

// Get transaction history for an account
router.get('/transactions/:accountId', bankingController.getTransactionHistory);

// Search for players (for transfer feature)
router.get('/players/search', bankingController.searchPlayers);

export default router;
