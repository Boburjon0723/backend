import { Request, Response } from 'express';
import { pool } from '../../config/database';
import { TransactionModel } from '../../models/postgres/Transaction';
import bcrypt from 'bcryptjs';

// Expert Management
export const getPendingExperts = async (req: Request, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.name, u.surname, u.email, u.phone, u.username, u.avatar_url,
                   p.profession, p.specialization, p.specialization_details, p.experience_years, 
                   p.institution, p.current_workplace, p.hourly_rate, p.currency,
                   p.has_diploma, p.diploma_url, p.certificate_url, p.id_url, p.selfie_url, p.resume_url,
                   p.service_languages, p.service_format, p.bio_expert, p.specialty_desc,
                   p.verified_status, p.created_at as profile_created_at
            FROM users u
            JOIN user_profiles p ON u.id = p.user_id
            WHERE p.verified_status = 'pending'
            ORDER BY p.updated_at DESC
        `);
        res.status(200).json(result.rows);
    } catch (error: any) {
        console.error('Admin Fetch Pending Experts Error:', error.message, error.stack);
        res.status(500).json({ message: 'Failed to fetch pending experts', error: error.message });
    }
};

export const verifyExpert = async (req: Request, res: Response) => {
    try {
        const { userId, status } = req.body; // status: 'approved' | 'rejected'
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        await pool.query(`
            UPDATE user_profiles 
            SET verified_status = $1, is_expert = $2, updated_at = NOW() 
            WHERE user_id = $3
            `, [status, status === 'approved', userId]);

        const io = req.app.get('io');
        if (io) {
            io.emit('expert_status_updated', { userId, status });
        }

        res.status(200).json({ message: `Expert status updated to ${status} ` });
    } catch (error) {
        console.error('Verify Expert Error:', error);
        res.status(500).json({ message: 'Update failed' });
    }
};

// Top Up Management
export const getAllTopUpRequests = async (req: Request, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT t.*, u.name, u.email, u.phone 
            FROM topup_requests t
            JOIN users u ON t.user_id = u.id
            ORDER BY t.created_at DESC
            `);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Admin Fetch TopUps Error:', error);
        res.status(500).json({ message: 'Failed to fetch requests' });
    }
};

export const approveTopUp = async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
        const { requestId } = req.body;
        const adminId = (req as any).user.id; // Admin performing the action

        await client.query('BEGIN');

        // 1. Get Request
        const requestRes = await client.query('SELECT * FROM topup_requests WHERE id = $1 FOR UPDATE', [requestId]);
        const request = requestRes.rows[0];

        if (!request) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Request not found' });
        }
        if (request.status !== 'pending') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Request already processed' });
        }

        const amount = parseFloat(request.amount);
        const userId = request.user_id;

        // 2. Get Platform Treasury Balance
        const treasuryRes = await client.query('SELECT balance FROM platform_balance WHERE id = 1 FOR UPDATE');
        const treasury = treasuryRes.rows[0];

        if (!treasury) {
            await client.query('ROLLBACK');
            return res.status(500).json({ message: 'Platform treasury not found' });
        }

        // 3. Check Balance
        if (parseFloat(treasury.balance) < amount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Insufficient treasury balance' });
        }

        // 4. Transfer from Treasury to User
        await client.query('UPDATE platform_balance SET balance = balance - $1 WHERE id = 1', [amount]);
        await client.query(`
            UPDATE token_balances 
            SET balance = balance + $1,
            lifetime_earned = lifetime_earned + $1 
            WHERE user_id = $2
            `, [amount, userId]);

        // 5. Update Request Status
        await client.query('UPDATE topup_requests SET status = $1, updated_at = NOW() WHERE id = $2', ['approved', requestId]);

        // 6. Record Transaction
        await TransactionModel.create(client, {
            sender_id: null, // System/Treasury
            receiver_id: userId,
            amount: amount,
            fee: 0,
            net_amount: amount,
            type: 'deposit',
            status: 'completed',
            note: 'Admin Approved Top-Up'
        });

        await client.query('COMMIT');

        const io = req.app.get('io');
        if (io) {
            io.to(userId).emit('balance_updated');
        }

        res.status(200).json({ message: 'Top-up approved successfully' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Approve TopUp Error:', error);
        res.status(500).json({ message: 'Approval failed' });
    } finally {
        client.release();
    }
};

export const rejectTopUp = async (req: Request, res: Response) => {
    try {
        const { requestId } = req.body;
        await pool.query('UPDATE topup_requests SET status = $1, updated_at = NOW() WHERE id = $2', ['rejected', requestId]);
        res.status(200).json({ message: 'Top-up rejected' });
    } catch (error) {
        res.status(500).json({ message: 'Rejection failed' });
    }
};

// User Management
export const getAllUsers = async (req: Request, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT id, name, surname, email, phone, role, is_active, created_at, avatar_url 
            FROM users 
            ORDER BY created_at DESC
        `);
        const users = result.rows;

        // Attach wallet info
        for (let user of users) {
            const w = await pool.query('SELECT balance FROM token_balances WHERE user_id = $1', [user.id]);
            user.wallet = w.rows[0] || { balance: 0 };
        }

        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch users' });
    }
};

export const updateUserStatus = async (req: Request, res: Response) => {
    try {
        const { userId, status } = req.body; // status: 'active' | 'blocked'
        await pool.query('UPDATE users SET is_active = $1 WHERE id = $2', [status === 'active', userId]);
        res.status(200).json({ message: `User ${status} ` });
    } catch (error) {
        res.status(500).json({ message: 'Update failed' });
    }
};

// Transaction Monitoring
export const getAllTransactions = async (req: Request, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT t.*, s.name as sender_name, r.name as receiver_name 
            FROM transactions t
            LEFT JOIN users s ON t.sender_id = s.id
            LEFT JOIN users r ON t.receiver_id = r.id
            ORDER BY t.created_at DESC LIMIT 100
            `);
        res.status(200).json(result.rows);
    } catch (error: any) {
        console.error('Admin Fetch Transactions Error:', error.message, error.stack);
        res.status(500).json({ message: 'Failed to fetch transactions', error: error.message });
    }
};
