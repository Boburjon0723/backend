import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import { getSessionChatHistory, startSessionRecording, stopSessionRecording, getSessionHistory, recordingDoneToChat, getLiveSessionState } from '../controllers/session.controller';

const router = Router();

// Used to fetch chat history of the Live Workspace
router.get('/sessions/history', authenticateToken, getSessionHistory);
router.get('/sessions/:sessionId/live', authenticateToken, getLiveSessionState);
router.get('/sessions/:sessionId/chat', authenticateToken, getSessionChatHistory);

// Recording: start/stop + yozuvni guruhga xabar qilib yuborish (Supabase 50 MB)
router.post('/sessions/:sessionId/record/start', authenticateToken, startSessionRecording);
router.post('/sessions/:sessionId/record/stop', authenticateToken, stopSessionRecording);
router.post('/sessions/:sessionId/recording-done', authenticateToken, recordingDoneToChat);

export default router;
