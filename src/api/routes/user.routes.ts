import { Router } from 'express';
import { getUsers, getProfile, updateProfile, searchUsers, getContacts, addContact, removeContact, getUserById } from '../controllers/user.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.get('/', getUsers); // Admin/Public list?
router.get('/me', authenticateToken, getProfile);
router.put('/me', authenticateToken, updateProfile);
router.get('/search', authenticateToken, searchUsers);
router.get('/contacts', authenticateToken, getContacts);
router.post('/contacts', authenticateToken, addContact);
router.delete('/contacts/:contactId', authenticateToken, removeContact);
router.get('/:userId', authenticateToken, getUserById);

export default router;
