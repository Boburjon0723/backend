import { Request, Response } from 'express';
import { pool } from '../../config/database';
import { TransactionModel } from '../../models/postgres/Transaction';
import bcrypt from 'bcryptjs';

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

        // 2. Get Central Reserve (Assuming the logged in admin controls it, or we use a special system wallet)
        // For simplicity, we'll assume the 'admin' user IS the reserve or has rights to mint/transfer from reserve.
        // Let's find the Reserve Wallet ID.
        const reserveRes = await client.query(`
            SELECT w.* 
            FROM wallets w 
            JOIN users u ON w.user_id = u.id 
            WHERE u.email = 'reserve@mali.system'
        `);
        const reserveWallet = reserveRes.rows[0];

        if (!reserveWallet) {
            await client.query('ROLLBACK');
            return res.status(500).json({ message: 'Reserve wallet not found' });
        }

        // 3. Check Balance (Reserve should have infinite or huge balance, but let's check)
        if (parseFloat(reserveWallet.balance) < amount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Reserve wallet has insufficient funds' });
        }

        // 4. Transfer
        await client.query('UPDATE wallets SET balance = balance - $1 WHERE id = $2', [amount, reserveWallet.id]);
        await client.query('UPDATE wallets SET balance = balance + $1 WHERE user_id = $2', [amount, userId]);

        // 5. Update Request Status
        await client.query('UPDATE topup_requests SET status = $1, updated_at = NOW() WHERE id = $2', ['approved', requestId]);

        // 6. Record Transaction
        await TransactionModel.create(client, {
            sender_id: reserveWallet.user_id,
            receiver_id: userId,
            amount: amount,
            fee: 0,
            net_amount: amount,
            type: 'deposit',
            status: 'completed',
            note: 'Admin Approved Top-Up'
        });

        await client.query('COMMIT');
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
            const w = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [user.id]);
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
        res.status(200).json({ message: `User ${status}` });
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
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch transactions' });
    }
};
