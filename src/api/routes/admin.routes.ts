import { Router } from 'express';
import {
    getAllTopUpRequests,
    approveTopUp,
    rejectTopUp,
    getAllUsers,
    updateUserStatus,
    getAllTransactions
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

export default router;
