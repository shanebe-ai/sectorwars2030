import express from 'express';
import { register, login, getProfile } from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit';

const router = express.Router();

// Public routes
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);

// Protected routes
router.get('/profile', authenticateToken, getProfile);

export default router;
