import { Router } from 'express';
import { startSession, endSession } from '../controllers/video.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.post('/sessions/start', authenticateToken, startSession);
router.post('/sessions/end', authenticateToken, endSession);

export default router;
