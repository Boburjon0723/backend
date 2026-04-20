import { Request, Response, NextFunction } from 'express';
import { safeGetCache, safeSetCache } from '../config/redis';

/**
 * Middleware to cache GET responses in Redis.
 * @param durationSeconds Cache duration in seconds. Default is 300 (5 minutes).
 */
export const cacheMiddleware = (durationSeconds: number = 300) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        // Only cache GET requests
        if (req.method !== 'GET') {
            return next();
        }

        const key = `cache:${req.originalUrl || req.url}`;
        
        try {
            const cachedBody = await safeGetCache(key);
            if (cachedBody) {
                // If it's cached, return it
                return res.send(JSON.parse(cachedBody));
            }

            // Patch res.send to save to cache
            const originalSend = res.send;
            res.send = function (body) {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    safeSetCache(key, typeof body === 'string' ? body : JSON.stringify(body), durationSeconds)
                        .catch(err => console.warn('Cache set error:', err));
                }
                return originalSend.call(this, body);
            };

            next();
        } catch (error) {
            console.error('Cache middleware error:', error);
            next();
        }
    };
};

/**
 * Helper to clear cache by pattern
 */
export const clearCache = async (pattern: string) => {
    // Note: In production with many keys, pattern matching might be slow.
    // Consider using a better invalidation strategy.
    // For now, we'll just implement a simple key delete helper.
    // This is often used manually or in controllers after POST/PUT/DELETE.
};
