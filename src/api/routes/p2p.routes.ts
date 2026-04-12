import { Router } from 'express';
import {
    getAds, createAd, initiateTrade, confirmTrade,
    cancelTrade, getMyTrades, getMyAds, updateAd,
    deleteAd, getTradeDetails, getTradeChat
} from '../controllers/p2p.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.get('/', getAds);
router.get('/my-ads', authenticateToken, getMyAds);
router.get('/trades', authenticateToken, getMyTrades);
router.get('/trade/:tradeId', authenticateToken, getTradeDetails);
router.get('/trade-chat/:tradeId', authenticateToken, getTradeChat);
router.post('/', authenticateToken, createAd);
router.put('/', authenticateToken, updateAd);
router.delete('/:adId', authenticateToken, deleteAd);
router.post('/trade', authenticateToken, initiateTrade);
router.post('/trade/confirm', authenticateToken, confirmTrade);
router.post('/trade/cancel', authenticateToken, cancelTrade);

export default router;
