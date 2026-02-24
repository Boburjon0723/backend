import { Router } from 'express';
import {
    getAllTopUpRequests,
    approveTopUp,
    rejectTopUp,
    getAllUsers,
    updateUserStatus,
    getAllTransactions,
    getPendingExperts,
    verifyExpert
} from '../controllers/admin.controller';
import { authenticateToken, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

// Apply admin check to all routes
router.use(authenticateToken, requireAdmin);

router.get('/topups', getAllTopUpRequests);
router.post('/topups/approve', approveTopUp);
router.post('/topups/reject', rejectTopUp);

router.get('/users', getAllUsers);
router.post('/users/status', updateUserStatus);

router.get('/transactions', getAllTransactions);

router.get('/experts/pending', getPendingExperts);
router.post('/experts/verify', verifyExpert);

export default router;
