import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { TransactionModel } from '../../models/postgres/Transaction';
import { pool } from '../../config/database';

// Helper to get Central Reserve Wallet ID
async function getCentralReserveId(client: any): Promise<string | null> {
    const res = await client.query(`
        SELECT w.id, w.user_id 
        FROM wallets w
        JOIN users u ON w.user_id = u.id
        WHERE u.email = 'reserve@mali.system'
    `);
    return res.rows[0]?.user_id || null;
}

export const setupWallet = async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
        const userId = (req as any).user.id;
        const { pin } = req.body;

        if (!pin || pin.length !== 4 || isNaN(Number(pin))) {
            return res.status(400).json({ message: 'PIN must be a 4-digit number' });
        }

        const salt = await bcrypt.genSalt(10);
        const pinHash = await bcrypt.hash(pin, salt);

        await client.query(`
            INSERT INTO wallets (user_id, pin_hash, updated_at)
            VALUES ($2, $1, NOW())
            ON CONFLICT (user_id) DO UPDATE 
            SET pin_hash = EXCLUDED.pin_hash, updated_at = NOW()
        `, [pinHash, userId]);

        // If wallet didn't exist (edge case), create it? init_wallet_db already creates rows for existing users.
        // We assume row exists.

        res.status(200).json({ message: 'Wallet PIN set successfully' });
    } catch (error) {
        console.error("Wallet Setup Error:", error);
        res.status(500).json({ message: 'Setup failed' });
    } finally {
        client.release();
    }
};

export const transferCoins = async (req: Request, res: Response) => {
    const client = await pool.connect();

    try {
        const { receiverId, amount, pin } = req.body;
        const senderId = (req as any).user.id;
        const transferAmount = parseFloat(amount);

        if (!receiverId || !transferAmount || transferAmount <= 0) {
            return res.status(400).json({ message: 'Invalid receiver or amount' });
        }
        if (senderId === receiverId) {
            return res.status(400).json({ message: 'Cannot transfer to yourself' });
        }
        if (!pin) {
            return res.status(400).json({ message: 'PIN is required' });
        }

        await client.query('BEGIN');


        const userRes = await client.query('SELECT is_active FROM users WHERE id = $1', [senderId]);
        if (!userRes.rows[0]?.is_active) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'User is blocked. Actions restricted.' });
        }

        // 1. Fetch Sender Wallet & Verify PIN
        const senderWalletRes = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [senderId]);
        const senderWallet = senderWalletRes.rows[0];

        if (!senderWallet) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Sender wallet not found' });
        }

        if (!senderWallet.pin_hash) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'Wallet PIN not set. Please set up your wallet first.' });
        }

        const isPinValid = await bcrypt.compare(pin, senderWallet.pin_hash);
        if (!isPinValid) {
            await client.query('ROLLBACK');
            return res.status(401).json({ message: 'Invalid PIN' });
        }

        if (parseFloat(senderWallet.balance) < transferAmount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Insufficient funds' });
        }

        // 2. Fetch Receiver Wallet
        const receiverWalletRes = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [receiverId]);
        let receiverWallet = receiverWalletRes.rows[0];

        if (!receiverWallet) {
            // Create if not exists (auto-create wallet for receiver)
            const newW = await client.query('INSERT INTO wallets (user_id, balance) VALUES ($1, 0) RETURNING *', [receiverId]);
            receiverWallet = newW.rows[0];
        }

        // 3. Execute Transfer
        await client.query('UPDATE wallets SET balance = balance - $1 WHERE user_id = $2', [transferAmount, senderId]);
        await client.query('UPDATE wallets SET balance = balance + $1 WHERE user_id = $2', [transferAmount, receiverId]);

        // 4. Record Transaction
        const transaction = await TransactionModel.create(client, {
            sender_id: senderId,
            receiver_id: receiverId,
            amount: transferAmount,
            fee: 0,
            net_amount: transferAmount,
            type: 'transfer',
            status: 'completed',
            note: 'Secure Transfer'
        });

        await client.query('COMMIT');

        res.status(200).json({
            message: 'Transfer successful',
            transaction,
            newBalance: parseFloat(senderWallet.balance) - transferAmount
        });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Transfer Error:', error);
        res.status(500).json({ message: 'Transfer failed', error: error.message });
    } finally {
        client.release();
    }
};

export const getBalance = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const resWallet = await pool.query('SELECT balance, is_locked FROM wallets WHERE user_id = $1', [userId]);

        if (resWallet.rows.length === 0) {
            // Return 0 if no wallet
            return res.status(200).json({ balance: 0, locked_balance: 0, currency: 'MALI', hasPin: false });
        }

        const wallet = resWallet.rows[0];
        // Check if PIN is set by querying pin_hash existence
        const pinCheck = await pool.query('SELECT pin_hash FROM wallets WHERE user_id = $1', [userId]);
        const hasPin = !!pinCheck.rows[0]?.pin_hash;

        res.status(200).json({
            balance: parseFloat(wallet.balance),
            locked_balance: 0, // Implement locked logic later
            currency: 'MALI',
            hasPin
        });
    } catch (error) {
        console.error('Get Balance Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const requestRecovery = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        await pool.query(`
            UPDATE wallets 
            SET recovery_status = 'pending', recovery_requested_at = NOW() 
            WHERE user_id = $1
        `, [userId]);

        res.status(200).json({ message: 'Recovery requested. Checks initiated (30-day lock).' });
    } catch (e) {
        res.status(500).json({ message: 'Error requesting recovery' });
    }
};

export const createTopUpRequest = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { amount } = req.body;

        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({ message: 'Invalid amount' });
        }

        const userRes = await pool.query('SELECT is_active FROM users WHERE id = $1', [userId]);
        if (!userRes.rows[0]?.is_active) {
            return res.status(403).json({ message: 'User is blocked' });
        }

        await pool.query(
            'INSERT INTO topup_requests (user_id, amount, status) VALUES ($1, $2, $3)',
            [userId, amount, 'pending']
        );

        res.status(201).json({ message: 'Top-up request submitted successfully' });
    } catch (error) {
        console.error('Top-up Request Error:', error);
        res.status(500).json({ message: 'Failed to submit request' });
    }
};

export const getTopUpRequests = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const result = await pool.query(
            'SELECT * FROM topup_requests WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Get Top-up Requests Error:', error);
        res.status(500).json({ message: 'Failed to fetch requests' });
    }
};
