import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import { createToken, endSession } from '../controllers/livekit.controller';

const router = Router();

// Used to join the LiveKit session room
router.get('/livekit/token', authenticateToken, createToken);

// Mentor calls this when ending a session
router.post('/livekit/end-session', authenticateToken, endSession);

export default router;

