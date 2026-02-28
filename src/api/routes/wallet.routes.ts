import { Router } from 'express';
import { WalletController } from '../controllers/wallet.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.use(authenticateToken);

router.get('/balance', WalletController.getBalance);
router.post('/subscribe', WalletController.subscribeExpert);
router.post('/book', WalletController.bookSession);
router.post('/complete', WalletController.completeSession);
router.get('/my-bookings', WalletController.getMyBookings);
router.get('/settings', WalletController.getPlatformSettings);


export default router;
