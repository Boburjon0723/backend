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
                   p.service_languages, p.service_format, p.bio_expert, p.specialty_desc, p.expert_proposal,
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

export const getVerifiedExperts = async (req: Request, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.name, u.surname, u.email, u.phone, u.username, u.avatar_url,
                   p.profession, p.specialization, p.specialization_details, p.experience_years, 
                   p.institution, p.current_workplace, p.hourly_rate, p.currency,
                   p.has_diploma, p.diploma_url, p.certificate_url, p.id_url, p.selfie_url, p.resume_url,
                   p.service_languages, p.service_format, p.bio_expert, p.specialty_desc, p.expert_proposal,
                   p.verified_status, p.created_at as profile_created_at
            FROM users u
            JOIN user_profiles p ON u.id = p.user_id
            WHERE p.verified_status IN ('approved', 'rejected')
            ORDER BY p.updated_at DESC
        `);
        res.status(200).json(result.rows);
    } catch (error: any) {
        console.error('Admin Fetch Verified Experts Error:', error.message, error.stack);
        res.status(500).json({ message: 'Failed to fetch verified experts', error: error.message });
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
            SELECT id, name, surname, email, phone, role, is_active, phone_verified, created_at, avatar_url 
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

// Platform Settings Management
export const getPlatformSettings = async (req: Request, res: Response) => {
    try {
        const [settingsRes, treasuryRes, userBalanceRes, lockedBalanceRes, mentorEscrowPendingRes, mentorPayoutRes] = await Promise.all([
            pool.query('SELECT * FROM platform_settings ORDER BY updated_at DESC LIMIT 1'),
            pool.query('SELECT balance, total_fees_collected FROM platform_balance ORDER BY id ASC LIMIT 1'),
            pool.query('SELECT COALESCE(SUM(balance), 0) AS total_user_balance FROM token_balances'),
            pool.query('SELECT COALESCE(SUM(locked_balance), 0) AS total_locked_balance FROM token_balances'),
            pool.query(`
                SELECT COALESCE(SUM(amount), 0) AS mentor_escrow_pending
                FROM transactions
                WHERE type = 'booking' AND status = 'pending' AND note ILIKE 'Mentor 30 kun%'
            `),
            pool.query(`
                SELECT COALESCE(SUM(net_amount), 0) AS mentor_payout_completed
                FROM transactions
                WHERE type = 'booking' AND status = 'completed' AND note ILIKE 'Mentor 30 kun%'
            `)
        ]);

        const settings = settingsRes.rows[0] || { expert_subscription_fee: 20, commission_rate: 0.10, admin_card_number: null };
        const treasury = treasuryRes.rows[0] || { balance: 0, total_fees_collected: 0 };
        const totalUserBalance = Number.parseFloat(userBalanceRes.rows[0]?.total_user_balance || 0);
        const totalLockedBalance = Number.parseFloat(lockedBalanceRes.rows[0]?.total_locked_balance || 0);
        const mentorEscrowPending = Number.parseFloat(mentorEscrowPendingRes.rows[0]?.mentor_escrow_pending || 0);
        const mentorPayoutCompleted = Number.parseFloat(mentorPayoutRes.rows[0]?.mentor_payout_completed || 0);

        res.status(200).json({
            ...settings,
            system_treasury_balance: Number.parseFloat(treasury.balance || 0),
            total_fees_collected: Number.parseFloat(treasury.total_fees_collected || 0),
            total_user_balance: Number.isFinite(totalUserBalance) ? totalUserBalance : 0,
            total_locked_balance: Number.isFinite(totalLockedBalance) ? totalLockedBalance : 0,
            mentor_escrow_pending: Number.isFinite(mentorEscrowPending) ? mentorEscrowPending : 0,
            mentor_payout_completed: Number.isFinite(mentorPayoutCompleted) ? mentorPayoutCompleted : 0
        });
    } catch (error: any) {
        res.status(500).json({ message: 'Failed to fetch settings' });
    }
};

export const updatePlatformSettings = async (req: Request, res: Response) => {
    try {
        const { expert_subscription_fee, commission_rate, admin_card_number } = req.body;
        const normalizedCard = typeof admin_card_number === 'string'
            ? admin_card_number.replace(/\s+/g, '').trim()
            : null;
        const existing = await pool.query('SELECT ctid FROM platform_settings ORDER BY updated_at DESC LIMIT 1');
        if (existing.rows.length === 0) {
            await pool.query(
                'INSERT INTO platform_settings (expert_subscription_fee, commission_rate, admin_card_number, updated_at) VALUES ($1, $2, $3, NOW())',
                [expert_subscription_fee, commission_rate, normalizedCard || null]
            );
        } else {
            await pool.query(
                `UPDATE platform_settings
                 SET expert_subscription_fee = $1, commission_rate = $2, admin_card_number = $3, updated_at = NOW()
                 WHERE ctid = $4`,
                [expert_subscription_fee, commission_rate, normalizedCard || null, existing.rows[0].ctid]
            );
        }

        res.status(200).json({ message: 'Settings updated successfully' });
    } catch (error: any) {
        res.status(500).json({ message: 'Failed to update settings' });
    }
};

// Admin Login Audit
export const getAdminLoginAudit = async (req: Request, res: Response) => {
    try {
        const limitRaw = (req.query.limit as string | undefined) || '200';
        const limit = Number.parseInt(limitRaw, 10);
        const safeLimit = Number.isFinite(limit) && limit > 0 && limit <= 1000 ? limit : 200;

        const result = await pool.query(
            `
            SELECT
                ala.id,
                ala.phone_or_email,
                ala.ip_address,
                ala.user_agent,
                ala.success,
                ala.reason,
                ala.created_at,
                u.id AS user_id,
                u.name,
                u.surname,
                u.email,
                u.phone,
                u.role
            FROM admin_login_audit ala
            LEFT JOIN users u ON ala.user_id = u.id
            ORDER BY ala.created_at DESC
            LIMIT $1
        `,
            [safeLimit]
        );

        res.status(200).json(result.rows);
    } catch (error: any) {
        console.error('Admin Fetch Login Audit Error:', error.message, error.stack);
        res.status(500).json({ message: 'Failed to fetch admin login audit', error: error.message });
    }
};

// Escrow Dispute Management
export const getDisputedDeals = async (req: Request, res: Response) => {
    try {
        const result = await pool.query(`
            SELECT d.*, c.id as client_id, c.name as client_name, e.id as expert_id, e.name as expert_name
            FROM listing_service_deals d
            JOIN users c ON d.client_id = c.id
            JOIN users e ON d.expert_id = e.id
            WHERE d.status = 'disputed'
            ORDER BY d.updated_at DESC
        `);
        res.status(200).json(result.rows);
    } catch (error: any) {
        res.status(500).json({ message: 'Failed to fetch disputed deals' });
    }
};

export const resolveDispute = async (req: Request, res: Response) => {
    try {
        const { dealId, resolution } = req.body; // resolution: 'release' | 'refund'
        if (!['release', 'refund'].includes(resolution)) {
            return res.status(400).json({ message: 'Invalid resolution' });
        }

        const dr = await pool.query(`SELECT * FROM listing_service_deals WHERE id = $1`, [dealId]);
        const deal = dr.rows[0];
        if (!deal) return res.status(404).json({ message: 'Deal not found' });
        if (deal.status !== 'disputed') return res.status(400).json({ message: 'Deal is not in disputed status' });

        const { TokenService } = await import('../../services/token.service');

        if (resolution === 'release') {
            await TokenService.completeSession(deal.transaction_id);
            await pool.query(`UPDATE listing_service_deals SET status = 'completed', updated_at = NOW() WHERE id = $1`, [deal.id]);
        } else {
            await TokenService.cancelBooking(deal.transaction_id, deal.expert_id);
            await pool.query(`UPDATE listing_service_deals SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [deal.id]);
        }

        const io = req.app.get('io');
        if (io) {
            io.to(deal.client_id).emit('listing_deal_updated', { chatId: deal.chat_id });
            io.to(deal.expert_id).emit('listing_deal_updated', { chatId: deal.chat_id });
        }

        res.status(200).json({ message: `Dispute resolved with ${resolution}` });
    } catch (error: any) {
        console.error('Resolve Dispute Error:', error);
        res.status(500).json({ message: 'Resolution failed' });
    }
};

export const verifyUserPhone = async (req: Request, res: Response) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ message: 'UserId is required' });

        await pool.query('UPDATE users SET phone_verified = true WHERE id = $1', [userId]);

        res.status(200).json({ message: 'User phone verified successfully' });
    } catch (error: any) {
        console.error('Verify User Phone Error:', error);
        res.status(500).json({ message: 'Verification failed' });
    }
};
