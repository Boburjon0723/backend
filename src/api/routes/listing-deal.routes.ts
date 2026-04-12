import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import {
    getDealForChat,
    requestListingPayment,
    payListingDeal,
    markListingDealServiceDone,
    completeListingDeal,
    disputeListingDeal,
    cancelListingDeal,
} from '../controllers/listing-deal.controller';

const router = Router();
router.use(authenticateToken);

router.get('/chat/:chatId', getDealForChat);
router.post('/request', requestListingPayment);
router.post('/pay', payListingDeal);
router.post('/mark-done', markListingDealServiceDone);
router.post('/complete', completeListingDeal);
router.post('/dispute', disputeListingDeal);
router.post('/cancel', cancelListingDeal);

export default router;
