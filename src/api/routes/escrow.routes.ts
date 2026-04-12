import { Router } from 'express';
import { holdFunds, releaseFunds, refundFunds } from '../controllers/escrow.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.post('/escrow/hold', authenticateToken, holdFunds);
router.post('/escrow/release', authenticateToken, releaseFunds);
router.post('/escrow/refund', authenticateToken, refundFunds);

export default router;
