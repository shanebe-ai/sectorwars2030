import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as messageController from '../controllers/messageController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get unread count (before other routes to avoid conflict with :id)
router.get('/unread-count', messageController.getUnreadCount);

// Get known traders (players you've encountered)
router.get('/known-traders', messageController.getKnownTraders);

// Get player's corporation info
router.get('/corporation', messageController.getPlayerCorporation);

// Get inbox (direct messages)
router.get('/inbox', messageController.getInbox);

// Get broadcasts (universe-wide messages)
router.get('/broadcasts', messageController.getBroadcasts);

// Get corporate messages (alliance chat)
router.get('/corporate', messageController.getCorporateMessages);

// Get sent messages
router.get('/sent', messageController.getSentMessages);

// Send a message
router.post('/', messageController.sendMessage);

// Get a specific message
router.get('/:id', messageController.getMessage);

// Mark message as read
router.put('/:id/read', messageController.markAsRead);

// Delete a message
router.delete('/:id', messageController.deleteMessage);

export default router;

