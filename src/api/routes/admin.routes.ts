import { Router } from 'express';
import {
    getAllTopUpRequests,
    approveTopUp,
    rejectTopUp,
    getAllUsers,
    updateUserStatus,
    getAllTransactions,
    getPendingExperts,
    getVerifiedExperts,
    verifyExpert,
    getPlatformSettings,
    updatePlatformSettings,
    getAdminLoginAudit,
    getDisputedDeals,
    resolveDispute,
    verifyUserPhone,
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
router.post('/users/verify', verifyUserPhone);

router.get('/transactions', getAllTransactions);

router.get('/logins', getAdminLoginAudit);

router.get('/experts/pending', getPendingExperts);
router.get('/experts/verified', getVerifiedExperts);
router.post('/experts/verify', verifyExpert);

router.get('/settings', getPlatformSettings);
router.put('/settings', updatePlatformSettings);

router.get('/escrow/disputes', getDisputedDeals);
router.post('/escrow/resolve', resolveDispute);

export default router;
