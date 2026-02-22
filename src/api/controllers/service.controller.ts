import { Request, Response } from 'express';
import { pool } from '../../config/database';

export const initiateSession = async (req: Request, res: Response) => {
    const client_id = (req as any).user.id;
    const { expert_id, amount_mali, chat_id } = req.body;

    if (!expert_id || !amount_mali) {
        return res.status(400).json({ message: 'Expert ID and amount are required' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Check if expert is actually an expert
        const expertRes = await client.query(`
            SELECT p.is_expert, p.service_price 
            FROM user_profiles p 
            WHERE p.user_id = $1
        `, [expert_id]);

        if (expertRes.rows.length === 0 || !expertRes.rows[0].is_expert) {
            throw new Error('User is not a registered expert');
        }

        // 2. Check client balance
        const walletRes = await client.query('SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE', [client_id]);
        if (walletRes.rows.length === 0) throw new Error('Client wallet not found');

        const balance = parseFloat(walletRes.rows[0].balance);
        if (balance < amount_mali) {
            throw new Error('Insufficient MALI balance');
        }

        // 3. Lock funds
        await client.query(`
            UPDATE wallets 
            SET balance = balance - $1, locked = locked + $1 
            WHERE user_id = $2
        `, [amount_mali, client_id]);

        // 4. Create session
        const sessionRes = await client.query(`
            INSERT INTO service_sessions (expert_id, client_id, chat_id, amount_mali, status)
            VALUES ($1, $2, $3, $4, 'initiated')
            RETURNING *
        `, [expert_id, client_id, chat_id, amount_mali]);

        await client.query('COMMIT');

        const io = req.app.get('io');
        if (io) {
            io.to(expert_id).emit('service_session_updated', sessionRes.rows[0]);
            io.to(client_id).emit('service_session_updated', sessionRes.rows[0]);
            io.to(client_id).emit('balance_updated');
        }

        res.status(201).json(sessionRes.rows[0]);
    } catch (error: any) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: error.message });
    } finally {
        client.release();
    }
};

export const completeSession = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { sessionId } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const sessionRes = await client.query('SELECT * FROM service_sessions WHERE id = $1 FOR UPDATE', [sessionId]);
        if (sessionRes.rows.length === 0) throw new Error('Session not found');

        const session = sessionRes.rows[0];
        if (session.status !== 'initiated' && session.status !== 'ongoing') {
            throw new Error('Session cannot be completed in current state');
        }

        // Only client or expert can complete? Usually client confirms delivery.
        // For simplicity, let's allow either to confirm for now, but client is better.
        if (userId !== session.client_id && userId !== session.expert_id) {
            throw new Error('Unauthorized');
        }

        // Transfer locked funds from client to expert
        // 1. Deduct from client's locked
        await client.query('UPDATE wallets SET locked = locked - $1 WHERE user_id = $2', [session.amount_mali, session.client_id]);
        // 2. Add to expert's balance
        await client.query('UPDATE wallets SET balance = balance + $1 WHERE user_id = $2', [session.amount_mali, session.expert_id]);

        // Update session status
        const updatedRes = await client.query(`
            UPDATE service_sessions 
            SET status = 'completed', completed_at = NOW(), updated_at = NOW() 
            WHERE id = $1 RETURNING *
        `, [sessionId]);

        await client.query('COMMIT');

        const io = req.app.get('io');
        if (io) {
            io.to(session.expert_id).emit('service_session_updated', updatedRes.rows[0]);
            io.to(session.client_id).emit('service_session_updated', updatedRes.rows[0]);
            io.to(session.expert_id).emit('balance_updated');
        }

        res.json(updatedRes.rows[0]);
    } catch (error: any) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: error.message });
    } finally {
        client.release();
    }
};

export const cancelSession = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { sessionId } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const sessionRes = await client.query('SELECT * FROM service_sessions WHERE id = $1 FOR UPDATE', [sessionId]);
        if (sessionRes.rows.length === 0) throw new Error('Session not found');

        const session = sessionRes.rows[0];
        if (session.status !== 'initiated') throw new Error('Only initiated sessions can be cancelled');

        if (userId !== session.client_id && userId !== session.expert_id) {
            throw new Error('Unauthorized');
        }

        // Return locked funds to client
        await client.query('UPDATE wallets SET locked = locked - $1, balance = balance + $1 WHERE user_id = $2', [session.amount_mali, session.client_id]);

        const updatedRes = await client.query(`
            UPDATE service_sessions SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *
        `, [sessionId]);

        await client.query('COMMIT');

        const io = req.app.get('io');
        if (io) {
            io.to(session.expert_id).emit('service_session_updated', updatedRes.rows[0]);
            io.to(session.client_id).emit('service_session_updated', updatedRes.rows[0]);
            io.to(session.client_id).emit('balance_updated');
        }

        res.json(updatedRes.rows[0]);
    } catch (error: any) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: error.message });
    } finally {
        client.release();
    }
};

export const getMySessions = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const result = await pool.query(`
            SELECT s.*, 
                   u_exp.name as expert_name, u_exp.avatar_url as expert_avatar,
                   u_cli.name as client_name, u_cli.avatar_url as client_avatar
            FROM service_sessions s
            JOIN users u_exp ON s.expert_id = u_exp.id
            JOIN users u_cli ON s.client_id = u_cli.id
            WHERE s.expert_id = $1 OR s.client_id = $1
            ORDER BY s.updated_at DESC
        `, [userId]);
        res.json(result.rows);
    } catch (e) {
        res.status(500).json({ message: 'Server error' });
    }
};
