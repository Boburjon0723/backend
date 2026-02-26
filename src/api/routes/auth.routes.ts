import { Router } from 'express';
import { register, login, refresh } from '../controllers/auth.controller';
import { authLimiter } from '../../middleware/rateLimit.middleware';

const router = Router();

router.post('/auth/register', authLimiter, register);
router.post('/auth/login', authLimiter, login);
router.post('/auth/refresh', authLimiter, refresh);

export default router;
