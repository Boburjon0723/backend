import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
    user?: any;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error("JWT_SECRET is not defined");
        return res.status(500).json({ message: 'Internal Server Error' });
    }

    jwt.verify(token, secret, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token' });
        }
        (req as any).user = user;
        next();
    });
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
    // authenticateToken must run first to populate req.user
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};

export interface BotAuthRequest extends Request {
    bot?: any;
}

export const authenticateBotToken = async (req: BotAuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const tokenFromHeader = authHeader && authHeader.startsWith('Bot ') ? authHeader.slice(4).trim() : null;
    const tokenFromQuery = (req.headers['x-bot-token'] as string) || null;
    const token = tokenFromHeader || tokenFromQuery;

    if (!token) {
        return res.status(401).json({ message: 'Bot token required (Authorization: Bot <token> or X-Bot-Token)' });
    }

    try {
        const { BotModel } = await import('../models/postgres/Bot');
        const bot = await BotModel.findByToken(token);
        if (!bot) {
            return res.status(403).json({ message: 'Invalid or expired bot token' });
        }
        (req as any).bot = bot;
        next();
    } catch (err) {
        console.error('Bot auth error:', err);
        return res.status(500).json({ message: 'Authentication error' });
    }
};
