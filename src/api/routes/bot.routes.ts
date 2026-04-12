import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import * as BotController from '../controllers/bot.controller';

const router = Router();

router.use(authenticateToken);

router.post('/bots', BotController.createBot);
router.get('/bots', BotController.listBots);
router.put('/bots/:id/regenerate', BotController.regenerateToken);
router.delete('/bots/:id', BotController.deleteBot);

export default router;
