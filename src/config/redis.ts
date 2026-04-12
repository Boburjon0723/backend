import { createClient } from 'redis';

// Determine if we should use Redis based on env var presence.
// This ensures the app still runs if no Redis server is available locally.
const redisUrl = process.env.REDIS_URL;

export const redisClient = redisUrl ? createClient({ url: redisUrl }) : null;

if (redisClient) {
    redisClient.on('error', (err) => console.warn('Redis Client Error', err));
    redisClient.on('connect', () => console.log('Redis connected successfully.'));

    // Connect immediately
    redisClient.connect().catch(console.error);
} else {
    console.log('No REDIS_URL provided in .env. Falling back to direct PostgreSQL queries for caching layer.');
}

/**
 * Helper to safely get from cache if Redis is configured.
 */
export const safeGetCache = async (key: string): Promise<string | null> => {
    if (!redisClient || !redisClient.isOpen) return null;
    try {
        return await redisClient.get(key);
    } catch (e) {
        console.warn(`Redis get error for key ${key}:`, e);
        return null;
    }
};

/**
 * Helper to safely set cache if Redis is configured.
 */
export const safeSetCache = async (key: string, value: string, expirationSeconds: number = 300): Promise<void> => {
    if (!redisClient || !redisClient.isOpen) return;
    try {
        await redisClient.setEx(key, expirationSeconds, value);
    } catch (e) {
        console.warn(`Redis set error for key ${key}:`, e);
    }
};

/**
 * Helper to safely delete cache if Redis is configured.
 */
export const safeDelCache = async (key: string): Promise<void> => {
    if (!redisClient || !redisClient.isOpen) return;
    try {
        await redisClient.del(key);
    } catch (e) {
        console.warn(`Redis del error for key ${key}:`, e);
    }
};
