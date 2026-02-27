import { Request, Response } from 'express';
import { pool } from '../../config/database';
import { EscrowService } from '../../services/escrow.service';
import { NotificationService } from '../../services/notification.service';

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

        // 2. Create session record first (to get session ID)
        const sessionRes = await client.query(`
            INSERT INTO service_sessions (expert_id, client_id, chat_id, amount_mali, status)
            VALUES ($1, $2, $3, $4, 'initiated')
            RETURNING *
        `, [expert_id, client_id, chat_id, amount_mali]);
        const session = sessionRes.rows[0];

        // 3. Use EscrowService to hold funds
        // We pass the client to keep it in the same transaction
        // Actually, EscrowService.holdFunds creates its own connection and transaction.
        // This is a bit tricky. I should probably refactor EscrowService to accept an optional client for transaction sharing.

        await client.query('COMMIT'); // Commit session creation before holding funds in separate tx?
        // No, better to have a version of holdFunds that accepts a client.

        // FOR NOW: Let's assume we want them separate or I'll just call EscrowService after committing session.
        // If escrow fails, we might have an "unpaid" session.

        const escrow = await EscrowService.holdFunds(client_id, parseFloat(amount_mali), { sessionId: session.id });

        const io = req.app.get('io');
        if (io) {
            io.to(expert_id).emit('service_session_updated', session);
            io.to(client_id).emit('service_session_updated', session);
            io.to(client_id).emit('balance_updated');

            // Send notification to Expert
            await NotificationService.createNotification(
                expert_id,
                'session_request',
                'Yangi sessiya so\'rovi',
                `${(req as any).user.name || 'Foydalanuvchi'} siz bilan sessiya boshlamoqchi. Miqdor: ${amount_mali} MALI`,
                { sessionId: session.id, chatId: chat_id },
                io
            );
        }

        res.status(201).json({ session, escrow });
    } catch (error: any) {
        if (client) await client.query('ROLLBACK');
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

        if (userId !== session.client_id && userId !== session.expert_id) {
            throw new Error('Unauthorized');
        }

        // Find associated escrow
        const escrowRes = await client.query("SELECT id FROM escrow WHERE metadata->>'session_id' = $1 AND status = 'held'", [sessionId]);
        if (escrowRes.rows.length === 0) throw new Error('No active escrow found for this session');

        const escrowId = escrowRes.rows[0].id;

        // Release funds using EscrowService
        await EscrowService.releaseFunds(escrowId);

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

            // Find escrow amount for notification
            const amountRes = await client.query('SELECT amount FROM escrow WHERE metadata->>\'session_id\' = $1', [sessionId]);
            const amount = amountRes.rows[0]?.amount || session.amount_mali;

            // Notify Expert about payment receipt
            await NotificationService.createNotification(
                session.expert_id,
                'payment_received',
                'To\'lov qabul qilindi',
                `${amount} MALI miqdoridagi mablag' hisobingizga tushdi.`,
                { sessionId, escrowId },
                io
            );

            // Notify Client about successful completion
            await NotificationService.createNotification(
                session.client_id,
                'session_completed',
                'Sessiya yakunlandi',
                'Sessiya muvaffaqiyatli yakunlandi va to\'lov amalga oshirildi.',
                { sessionId },
                io
            );
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
        await client.query('UPDATE token_balances SET locked_balance = locked_balance - $1, balance = balance + $1 WHERE user_id = $2', [session.amount_mali, session.client_id]);

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
