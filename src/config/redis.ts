import { createClient } from 'redis';

// Determine if we should use Redis based on env var presence.
// This ensures the app still runs if no Redis server is available locally.
const redisUrl = process.env.REDIS_URL;

export const redisClient = redisUrl ? createClient({ url: redisUrl }) : null;
export const subClient = redisUrl ? redisClient?.duplicate() : null;

if (redisClient && subClient) {
    redisClient.on('error', (err) => console.warn('Redis Client (Pub) Error', err));
    subClient.on('error', (err) => console.warn('Redis Client (Sub) Error', err));
    
    redisClient.on('connect', () => console.log('Redis Pub connected.'));
    subClient.on('connect', () => console.log('Redis Sub connected.'));

    // Connect both
    Promise.all([
        redisClient.connect(),
        subClient.connect()
    ]).catch(console.error);
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

/**
 * Presence management: Tracking online users
 */
const ONLINE_USERS_KEY = 'mali_online_users';

export const addUserToOnline = async (userId: string, socketId: string): Promise<void> => {
    if (!redisClient || !redisClient.isOpen) return;
    try {
        // We use a HASH to track userId -> socketCount
        // Increment count when a new socket connects
        await redisClient.hIncrBy(ONLINE_USERS_KEY, userId, 1);
    } catch (e) {
        console.warn(`Redis addUserToOnline error for ${userId}:`, e);
    }
};

export const removeUserFromOnline = async (userId: string): Promise<number> => {
    if (!redisClient || !redisClient.isOpen) return 0;
    try {
        const val = await redisClient.hIncrBy(ONLINE_USERS_KEY, userId, -1);
        if (val <= 0) {
            await redisClient.hDel(ONLINE_USERS_KEY, userId);
            return 0; // Truly offline
        }
        return val; // Still has other sockets online
    } catch (e) {
        console.warn(`Redis removeUserFromOnline error for ${userId}:`, e);
        return 0;
    }
};

export const isUserOnline = async (userId: string): Promise<boolean> => {
    if (!redisClient || !redisClient.isOpen) return false;
    try {
        const val = await redisClient.hGet(ONLINE_USERS_KEY, userId);
        return !!(val && parseInt(val) > 0);
    } catch (e) {
        return false;
    }
};

