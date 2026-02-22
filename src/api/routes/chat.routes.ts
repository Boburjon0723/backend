import { Router } from 'express';
import { createChat, getUserChats, getMessages, getChatDetails, addParticipant, getCommunities, joinCommunity } from '../controllers/chat.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken); // Protect all routes

router.post('/', createChat);
router.get('/', getUserChats);
router.get('/communities', getCommunities);
router.post('/communities/:chatId/join', joinCommunity);
router.get('/:chatId/messages', getMessages);
router.get('/:chatId', getChatDetails);
router.post('/:chatId/participants', addParticipant);

export default router;
