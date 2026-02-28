import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import { createToken } from '../controllers/livekit.controller';

const router = Router();

// Used to join the LiveKit session room
router.get('/livekit/token', authenticateToken, createToken);

export default router;
