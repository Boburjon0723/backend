import { Router, Request, Response } from 'express';
import { pool } from '../../config/database';
import mongoose from 'mongoose';

const router = Router();

router.get('/health', async (req: Request, res: Response) => {
    const healthcheck = {
        uptime: process.uptime(),
        message: 'OK',
        timestamp: Date.now(),
        postgres: 'disconnected',
        mongo: 'disconnected',
    };

    try {
        // Check Postgres
        await pool.query('SELECT 1');
        healthcheck.postgres = 'connected';
    } catch (error) {
        healthcheck.postgres = 'error';
    }

    try {
        // Check Mongo
        if (mongoose.connection.readyState === 1) {
            healthcheck.mongo = 'connected';
        } else {
            healthcheck.mongo = 'disconnected';
        }
    } catch (error) {
        healthcheck.mongo = 'error';
    }

    res.send(healthcheck);
});

export default router;
