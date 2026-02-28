import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import { getSessionChatHistory, startSessionRecording, stopSessionRecording } from '../controllers/session.controller';

const router = Router();

// Used to fetch chat history of the Live Workspace
router.get('/sessions/:sessionId/chat', authenticateToken, getSessionChatHistory);

// Egress Recording (Mock Logic for S3)
router.post('/sessions/:sessionId/record/start', authenticateToken, startSessionRecording);
router.post('/sessions/:sessionId/record/stop', authenticateToken, stopSessionRecording);

export default router;
