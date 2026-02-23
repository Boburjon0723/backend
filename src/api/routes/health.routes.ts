import { Router, Request, Response } from 'express';
import { pool } from '../../config/database';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
    const healthcheck = {
        uptime: process.uptime(),
        message: 'OK',
        timestamp: Date.now(),
        postgres: 'disconnected',
    };

    try {
        // Check Postgres
        await pool.query('SELECT 1');
        healthcheck.postgres = 'connected';
    } catch (error) {
        healthcheck.postgres = 'error';
    }

    res.send(healthcheck);
});

export default router;
