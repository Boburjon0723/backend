import { Request, Response } from 'express';
import { BotModel } from '../../models/postgres/Bot';

const USERNAME_REGEX = /^[a-z0-9_]+$/;

export const createBot = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { name, username } = req.body || {};
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ message: 'Bot nomi kerak' });
        }
        if (!username || typeof username !== 'string' || !username.trim()) {
            return res.status(400).json({ message: 'Bot username kerak' });
        }
        const u = username.trim().toLowerCase();
        if (u.length < 3) return res.status(400).json({ message: 'Username kamida 3 belgi' });
        if (!USERNAME_REGEX.test(u)) {
            return res.status(400).json({ message: 'Username faqat lotin (kichik), raqam va pastki chiziq bo\'lishi kerak' });
        }
        const existing = await BotModel.findByUsername(u);
        if (existing) return res.status(400).json({ message: 'Bu username band' });

        const { bot, token } = await BotModel.create(userId, name.trim(), u);
        const { token_hash, ...safeBot } = bot as any;
        res.status(201).json({ bot: safeBot, token });
    } catch (err) {
        console.error('Create bot error:', err);
        res.status(500).json({ message: 'Server xatosi' });
    }
};

export const listBots = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const bots = await BotModel.listByUserId(userId);
        res.json(bots);
    } catch (err) {
        console.error('List bots error:', err);
        res.status(500).json({ message: 'Server xatosi' });
    }
};

export const regenerateToken = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const botId = typeof req.params.id === 'string' ? req.params.id : (req.params.id?.[0] ?? '');
        const token = await BotModel.regenerateToken(botId, userId);
        if (!token) return res.status(404).json({ message: 'Bot topilmadi' });
        res.json({ token });
    } catch (err) {
        console.error('Regenerate token error:', err);
        res.status(500).json({ message: 'Server xatosi' });
    }
};

export const deleteBot = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const botId = typeof req.params.id === 'string' ? req.params.id : (req.params.id?.[0] ?? '');
        const ok = await BotModel.delete(botId, userId);
        if (!ok) return res.status(404).json({ message: 'Bot topilmadi' });
        res.json({ message: 'Bot o\'chirildi' });
    } catch (err) {
        console.error('Delete bot error:', err);
        res.status(500).json({ message: 'Server xatosi' });
    }
};
