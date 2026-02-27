import { Router } from 'express';
import { register, login, refresh } from '../controllers/auth.controller';
import { authLimiter } from '../../middleware/rateLimit.middleware';

const router = Router();

router.post('/auth/register', register);
router.post('/auth/login', login);
router.post('/auth/refresh', refresh);

export default router;
