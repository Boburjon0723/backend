import { Router } from 'express';
import {
    getUsers, getProfile, updateProfile, searchUsers, getContacts,
    addContact, removeContact, getUserById, blockUser, unblockUser,
    updateContact, getChatStats
} from '../controllers/user.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.get('/', getUsers);
router.get('/me', authenticateToken, getProfile);
router.put('/me', authenticateToken, updateProfile);
router.get('/search', authenticateToken, searchUsers);
router.get('/contacts', authenticateToken, getContacts);
router.post('/contacts', authenticateToken, addContact);
router.put('/contacts', authenticateToken, updateContact);
router.delete('/contacts/:contactId', authenticateToken, removeContact);
router.post('/block', authenticateToken, blockUser);
router.post('/unblock', authenticateToken, unblockUser);
router.get('/chat-stats/:chatId', authenticateToken, getChatStats);
router.get('/:userId', authenticateToken, getUserById);

export default router;
