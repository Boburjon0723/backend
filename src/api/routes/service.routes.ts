import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import {
    initiateSession,
    completeSession,
    cancelSession,
    getMySessions
} from '../controllers/service.controller';

const router = Router();

router.post('/initiate', authenticateToken, initiateSession);
router.post('/complete', authenticateToken, completeSession);
router.post('/cancel', authenticateToken, cancelSession);
router.get('/my-sessions', authenticateToken, getMySessions);

export default router;
