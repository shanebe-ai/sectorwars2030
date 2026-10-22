import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as smugglingController from '../controllers/smugglingController';

const router = Router();

// All smuggling routes require authentication.
router.use(authenticateToken);

router.get('/status', smugglingController.status);
router.get('/markets', smugglingController.marketBoard);
router.get('/auctions', smugglingController.auctions);
router.post('/trade', smugglingController.trade);
router.post('/auction/buy', smugglingController.buyAuctionLot);
router.get('/stash', smugglingController.stashInfo);
router.post('/stash', smugglingController.stash);
router.post('/stash/retrieve', smugglingController.retrieve);
router.post('/derelict/board', smugglingController.board);

export default router;
