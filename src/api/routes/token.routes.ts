import { Router } from 'express';
import { getBalance, transferCoins, setupWallet, requestRecovery, createTopUpRequest, getTopUpRequests, getTransactions, getWalletConfig } from '../controllers/token.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.get('/balance', authenticateToken, getBalance);
router.get('/config', authenticateToken, getWalletConfig);
router.post('/transfer', authenticateToken, transferCoins);
router.post('/setup', authenticateToken, setupWallet);
router.post('/recovery', authenticateToken, requestRecovery);
router.post('/topup', authenticateToken, createTopUpRequest);
router.get('/topup', authenticateToken, getTopUpRequests);
router.get('/transactions', authenticateToken, getTransactions);

export default router;
