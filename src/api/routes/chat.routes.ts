import { Router } from 'express';
import { createChat, getUserChats, getMessages, getChatDetails, addParticipant, getCommunities, joinCommunity, searchMessages, clearMessages, deleteChatEndpoint, deleteMessagesBulk, markAsRead } from '../controllers/chat.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken); // Protect all routes

router.post('/', createChat);
router.get('/', getUserChats);
router.get('/communities', getCommunities);
router.post('/communities/:chatId/join', joinCommunity);
router.get('/:chatId/messages', getMessages);
router.delete('/:chatId/messages', clearMessages);
router.delete('/:chatId/messages/bulk', deleteMessagesBulk);
router.post('/:chatId/read', markAsRead);
router.get('/:chatId/search', searchMessages);
router.get('/:chatId', getChatDetails);
router.delete('/:chatId', deleteChatEndpoint);
router.post('/:chatId/participants', addParticipant);

export default router;
