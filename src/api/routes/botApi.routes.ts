import { Router } from 'express';
import { authenticateBotToken } from '../../middleware/auth.middleware';
import * as BotApiController from '../controllers/botApi.controller';

const router = Router();

router.post('/bot/sendMessage', authenticateBotToken, BotApiController.sendMessage);
router.post('/bot/update-phone', authenticateBotToken, BotApiController.updateUserPhoneFromTelegram);

export default router;
