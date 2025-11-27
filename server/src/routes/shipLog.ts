import { Router } from 'express';
import * as shipLogController from '../controllers/shipLogController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/shiplogs - Get all ship logs
router.get('/', shipLogController.getShipLogs);

// GET /api/shiplogs/stats - Get log statistics
router.get('/stats', shipLogController.getLogStats);

// GET /api/shiplogs/unread-count - Get unread log count
router.get('/unread-count', shipLogController.getUnreadLogCount);

// GET /api/shiplogs/type/:logType - Get logs by type
router.get('/type/:logType', shipLogController.getShipLogsByType);

// POST /api/shiplogs/note - Add a manual note
router.post('/note', shipLogController.addManualNote);

// POST /api/shiplogs/mark-read - Mark all logs as read
router.post('/mark-read', shipLogController.markLogsAsRead);

// DELETE /api/shiplogs/:logId - Delete a manual note
router.delete('/:logId', shipLogController.deleteManualNote);

export default router;

