import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisClient } from '../config/redis';

// Helper to create store
const createStore = (prefix: string) => {
    if (redisClient && redisClient.isOpen) {
        return new RedisStore({
            // @ts-ignore
            sendCommand: (...args: string[]) => redisClient.sendCommand(args),
            prefix: `rl:${prefix}:`,
        });
    }
    return undefined; // Falls back to MemoryStore
};

// Global rate limiter
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per `window`
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore('global'),
    message: {
        message: 'Juda ko\'p so\'rov yuborildi. Iltimos, 15 daqiqadan so\'ng qayta urinib ko\'ring.'
    }
});

// Stepped limiter for auth routes
export const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    store: createStore('auth'),
    message: {
        message: 'Login yoki ro\'yxatdan o\'tish urinishlari juda ko\'p. Birozdan so\'ng qayta urining.'
    }
});

