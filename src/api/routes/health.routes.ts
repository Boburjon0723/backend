import { Router, Request, Response } from 'express';
import { pool } from '../../config/database';
import { redisClient, getOnlineUserCount } from '../../config/redis';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
    const healthcheck = {
        uptime: process.uptime(),
        message: 'OK',
        timestamp: Date.now(),
        postgres: 'disconnected',
        redis: 'disconnected',
        onlineUsers: 0
    };

    try {
        // Check Postgres
        await pool.query('SELECT 1');
        healthcheck.postgres = 'connected';
    } catch (error) {
        healthcheck.postgres = 'error';
    }

    try {
        // Check Redis
        if (redisClient && redisClient.isOpen) {
            await redisClient.ping();
            healthcheck.redis = 'connected';
            healthcheck.onlineUsers = await getOnlineUserCount();
        }
    } catch (error) {
        healthcheck.redis = 'error';
    }

    res.send(healthcheck);
});


export default router;
