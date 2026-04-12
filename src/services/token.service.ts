import { pool } from '../config/database';
import { TransactionModel } from '../models/postgres/Transaction';
import { NotificationService } from './notification.service';


interface TransferRequest {
    senderId: string;
    receiverId: string;
    amount: number;
    note?: string;
}

export class TokenService {
    private static MIN_TRANSFER = 1;
    private static readonly LEGAL_OR_PSYCH_REGEX =
        /(huquq|yurist|law|адвокат|юрист|psix|psych|псих)/i;

    /**
     * Fetch dynamic platform settings: commission_rate and expert_subscription_fee
     * Moslashuvchan: id-yo‘q (key/value) sxemada ham ishlaydi
     */
    static async getPlatformSettings() {
        try {
            const res = await pool.query('SELECT * FROM platform_settings ORDER BY id DESC LIMIT 1');
            if (res.rows[0]) return res.rows[0];
        } catch (e: any) {
            const msg = String(e?.message || '').toLowerCase();
            if (msg.includes('does not exist') && msg.includes('id')) {
                try {
                    const rows = await pool.query(`SELECT key, value FROM platform_settings WHERE key IN ('expert_subscription_fee', 'commission_rate')`);
                    const out: Record<string, string> = { expert_subscription_fee: '20.00', commission_rate: '0.10' };
                    rows.rows.forEach((r: { key: string; value: string }) => { out[r.key] = String(r.value); });
                    return out;
                } catch (_) {
                    return { expert_subscription_fee: '20.00', commission_rate: '0.10' };
                }
            }
            throw e;
        }
        return { expert_subscription_fee: '20.00', commission_rate: '0.10' };
    }

    /**
     * Core Transfer Logic with ACID Transaction
     */
    static async transferTokens(data: TransferRequest) {
        const { senderId, receiverId, amount, note } = data;

        // 1. Validation
        if (amount < this.MIN_TRANSFER) {
            throw new Error(`Minimum transfer amount is ${this.MIN_TRANSFER}`);
        }
        if (senderId === receiverId) {
            throw new Error("Cannot transfer to yourself");
        }

        const client = await pool.connect();

        try {
            // 2. Begin Transaction
            await client.query('BEGIN');

            // 3. Lock Sender Balance (SELECT FOR UPDATE)
            const senderBalanceRes = await client.query(
                'SELECT balance FROM token_balances WHERE user_id = $1 FOR UPDATE',
                [senderId]
            );

            const senderBalance = senderBalanceRes.rows[0];
            if (!senderBalance || parseFloat(senderBalance.balance) < amount) {
                throw new Error("Insufficient funds");
            }

            const fee = amount * 0.01; // 1% P2P transfer fee
            const netAmount = amount - fee;

            // 5. Update Sender Balance (Debit full amount)
            await client.query(
                'UPDATE token_balances SET balance = balance - $1, lifetime_spent = lifetime_spent + $1 WHERE user_id = $2',
                [amount, senderId]
            );

            // 6. Update Receiver Balance (Credit net amount)
            // Check if receiver balance row exists, if not create (though users should have initialized balances)
            // For safety, we assume user creation creates a balance row.
            await client.query(
                'UPDATE token_balances SET balance = balance + $1, lifetime_earned = lifetime_earned + $1 WHERE user_id = $2',
                [netAmount, receiverId]
            );

            // 7. Update Platform Balance (Credit fee)
            await client.query(
                'UPDATE platform_balance SET balance = balance + $1, total_fees_collected = total_fees_collected + $1 WHERE id = 1',
                [fee]
            );

            // 8. Create Transaction Record
            const transaction = await TransactionModel.create(client, {
                sender_id: senderId,
                receiver_id: receiverId,
                amount: amount,
                fee: fee,
                net_amount: netAmount,
                type: 'transfer',
                status: 'completed',
                note: note
            });

            // 9. Commit
            await client.query('COMMIT');

            return transaction;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async getBalance(userId: string) {
        const res = await pool.query('SELECT * FROM token_balances WHERE user_id = $1', [userId]);
        return res.rows[0] || { balance: '0.00', locked_balance: '0.00' };
    }

    /**
     * Expert activation (payment disabled for now).
     * Keeps endpoint compatibility but does NOT deduct MALI.
     */
    static async subscribeToExpert(userId: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Lock wallet row to serialize concurrent clicks (no deduction is applied).
            await client.query('SELECT balance FROM token_balances WHERE user_id = $1 FOR UPDATE', [userId]);

            // Update user role/status (30 days from now) without fee.
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 30);
            await client.query('UPDATE users SET is_expert_active = true, subscription_end_date = $1 WHERE id = $2', [endDate.toISOString(), userId]);

            await client.query('COMMIT');
            return { success: true, message: "Mutaxassis rejimi faollashtirildi (to'lov vaqtincha o'chirilgan)." };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Escrow Booking: Move MALI to locked balance
     */
    static async bookSession(
        studentId: string,
        expertId: string,
        amount: number,
        opts?: { note?: string; metadata?: Record<string, unknown> }
    ) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const balanceRes = await client.query('SELECT balance FROM token_balances WHERE user_id = $1 FOR UPDATE', [studentId]);
            if (!balanceRes.rows[0] || parseFloat(balanceRes.rows[0].balance) < amount) {
                throw new Error("Insufficient funds to book session");
            }

            // Move to locked balance
            await client.query('UPDATE token_balances SET balance = balance - $1, locked_balance = locked_balance + $1 WHERE user_id = $2', [amount, studentId]);

            // Record Pending Transaction
            const transaction = await TransactionModel.create(client, {
                sender_id: studentId,
                receiver_id: expertId,
                amount: amount,
                fee: 0,
                net_amount: amount,
                type: 'booking',
                status: 'pending',
                note: opts?.note || 'Session booking escrow',
                metadata: opts?.metadata || null
            });

            // Notify Expert
            await NotificationService.createNotification(
                expertId,
                'booking_new',
                "E'londan to'lov (escrow)",
                `Mijoz ${amount} MALI muzlatdi — siz xizmatni bajarilgan deb belgilagach, mijoz tasdiqlagach mablag‘ chiqadi.`,
                { transactionId: transaction.id, studentId, amount, ...(opts?.metadata || {}) }
            );

            await client.query('COMMIT');

            return transaction;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Complete Session: Distribute locked MALI to expert minus platform commission
     */
    static async completeSession(transactionId: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get Transaction
            const txRes = await client.query('SELECT * FROM transactions WHERE id = $1 AND status = \'pending\' FOR UPDATE', [transactionId]);
            const tx = txRes.rows[0];
            if (!tx) throw new Error("Pending transaction not found");

            const amount = parseFloat(tx.amount);
            // Mentor monthly escrow: no commission.
            const isMentorMonthly = String(tx.note || '').toLowerCase().includes('mentor 30 kun');

            // Expert service commission applies ONLY to legal/psychology experts.
            let commissionRate = 0;
            if (!isMentorMonthly) {
                const settings = await this.getPlatformSettings();
                const configuredRate = parseFloat(settings.commission_rate);
                const profileRes = await client.query(
                    `SELECT profession FROM user_profiles WHERE user_id = $1 LIMIT 1`,
                    [tx.receiver_id]
                );
                const profession = String(profileRes.rows[0]?.profession || '');
                const isEligibleExpert = TokenService.LEGAL_OR_PSYCH_REGEX.test(profession);
                if (isEligibleExpert) {
                    commissionRate = Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : 0.10;
                }
            }

            const fee = amount * commissionRate;
            const netAmount = amount - fee;

            // Remove from student's locked balance
            await client.query('UPDATE token_balances SET locked_balance = locked_balance - $1 WHERE user_id = $2', [amount, tx.sender_id]);

            // Credit net amount to Expert
            await client.query('UPDATE token_balances SET balance = balance + $1, lifetime_earned = lifetime_earned + $1 WHERE user_id = $2', [netAmount, tx.receiver_id]);

            // Credit fee to Platform
            await client.query('UPDATE platform_balance SET balance = balance + $1, total_fees_collected = total_fees_collected + $1 WHERE id = 1', [fee]);

            // Mark TX completed
            await client.query('UPDATE transactions SET status = \'completed\', fee = $1, net_amount = $2 WHERE id = $3', [fee, netAmount, transactionId]);

            await client.query('COMMIT');
            return { success: true, amount, netAmount, fee, senderId: tx.sender_id, receiverId: tx.receiver_id };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Cancel/Reject booking: return locked MALI to student, mark transaction cancelled.
     * Only the expert (receiver) can reject.
     */
    static async cancelBooking(transactionId: string, expertId: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const txRes = await client.query(
                'SELECT * FROM transactions WHERE id = $1 AND status = \'pending\' AND type = \'booking\' AND receiver_id = $2 FOR UPDATE',
                [transactionId, expertId]
            );
            const tx = txRes.rows[0];
            if (!tx) throw new Error('Booking not found or already processed');

            const amount = parseFloat(tx.amount);
            await client.query(
                'UPDATE token_balances SET balance = balance + $1, locked_balance = locked_balance - $1 WHERE user_id = $2',
                [amount, tx.sender_id]
            );
            await client.query('UPDATE transactions SET status = \'cancelled\' WHERE id = $1', [transactionId]);

            await client.query('COMMIT');
            return { success: true, refunded: amount, studentId: tx.sender_id };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    static async getExpertBookings(expertId: string) {
        // Fetch only the latest pending booking per student to avoid UI duplication
        const query = `
            SELECT DISTINCT ON (t.sender_id) 
                t.*, u.name as student_name, u.avatar_url as student_avatar
            FROM transactions t
            JOIN users u ON t.sender_id = u.id
            WHERE t.receiver_id = $1 AND t.status = 'pending' AND t.type = 'booking'
            ORDER BY t.sender_id, t.created_at DESC
        `;
        const res = await pool.query(query, [expertId]);

        // Sort the distinct results by created_at DESC as expected by UI
        return res.rows.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    }

    /**
     * Auto-release bookings older than 30 days
     */
    static async releaseExpiredBookings() {
        try {
            // Find all pending bookings older than 30 days
            const queryText = `
                SELECT t.id FROM transactions t
                LEFT JOIN listing_service_deals lsd ON lsd.transaction_id = t.id
                WHERE t.type = 'booking' AND t.status = 'pending' 
                AND t.created_at <= NOW() - INTERVAL '30 days'
                AND (lsd.id IS NULL OR lsd.status NOT IN ('disputed', 'cancelled'))
            `;
            const res = await pool.query(queryText);

            let releasedCount = 0;
            for (const row of res.rows) {
                try {
                    await this.completeSession(row.id);
                    releasedCount++;
                } catch (e: any) {
                    console.error(`Failed to auto-release booking ${row.id}:`, e.message);
                }
            }
            if (releasedCount > 0) {
                console.log(`✅ Auto-released ${releasedCount} expired bookings to experts.`);
            }
        } catch (error) {
            console.error('Error in releaseExpiredBookings:', error);
        }
    }

    /**
     * Auto-complete listing deals after 3 hours of 'pending_client_confirm'
     */
    static async autoCompleteListingDeals(io?: any) {
        try {
            const queryText = `
                SELECT lsd.id, lsd.transaction_id, lsd.client_id, lsd.expert_id
                FROM listing_service_deals lsd
                WHERE lsd.status = 'pending_client_confirm' 
                AND lsd.updated_at <= NOW() - INTERVAL '3 hours'
                AND lsd.transaction_id IS NOT NULL
            `;
            const res = await pool.query(queryText);

            let completedCount = 0;
            for (const row of res.rows) {
                try {
                    await this.completeSession(row.transaction_id);
                    await pool.query(
                        "UPDATE listing_service_deals SET status = 'completed', updated_at = NOW() WHERE id = $1",
                        [row.id]
                    );
                    completedCount++;

                    // Real-time bildirishnoma: balans yangilangani haqida xabardor qilish
                    if (io) {
                        if (row.client_id) io.to(String(row.client_id)).emit('balance_updated');
                        if (row.expert_id) io.to(String(row.expert_id)).emit('balance_updated');
                    }
                } catch (e: any) {
                    console.error(`Failed to auto-complete listing deal ${row.id}:`, e.message);
                }
            }
            if (completedCount > 0) {
                console.log(`✅ Auto-completed ${completedCount} listing deals after 3-hour timeout.`);
            }
        } catch (error) {
            console.error('Error in autoCompleteListingDeals:', error);
        }
    }

    /**
     * 30 kunlik mentor obunasi: pul darhol ustozga emas — talaba balansidan muzlatiladi (locked_balance),
     * tranzaksiya `booking` + `pending`. 30 kundan keyin releaseExpiredBookings / completeSession
     * orqali komissiya ushlab qolinadi va qolgani ustoz balansiga o'tadi.
     */
    static async subscribeToMentor(studentId: string, mentorId: string, amount: number) {
        if (amount <= 0) {
            throw new Error("To'lov summasi noto'g'ri");
        }

        const existingSub = await this.getActiveSubscription(studentId, mentorId);
        if (existingSub) {
            throw new Error('Bu ustozga allaqachon faol obuna mavjud');
        }

        const pendingRes = await pool.query(
            `SELECT id FROM transactions
             WHERE sender_id = $1 AND receiver_id = $2 AND type = 'booking' AND status = 'pending'`,
            [studentId, mentorId]
        );
        if (pendingRes.rows.length > 0) {
            throw new Error('Kutilayotgan mentor to\'lovi mavjud. Iltimos, avvalgi operatsiya yopilguncha kuting.');
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const balanceRes = await client.query(
                'SELECT balance FROM token_balances WHERE user_id = $1 FOR UPDATE',
                [studentId]
            );
            if (!balanceRes.rows[0] || parseFloat(balanceRes.rows[0].balance) < amount) {
                throw new Error('MALI yetarli emas');
            }

            await client.query(
                'UPDATE token_balances SET balance = balance - $1, locked_balance = locked_balance + $1 WHERE user_id = $2',
                [amount, studentId]
            );

            const tx = await TransactionModel.create(client, {
                sender_id: studentId,
                receiver_id: mentorId,
                amount,
                fee: 0,
                net_amount: amount,
                type: 'booking',
                status: 'pending',
                note: 'Mentor 30 kun obuna (escrow — 30 kundan keyin ustoz hisobiga)'
            });

            await client.query(
                `
                INSERT INTO student_mentor_subscriptions (student_id, mentor_id, started_at, expires_at, amount_paid, transaction_id)
                VALUES ($1, $2, NOW(), NOW() + INTERVAL '30 days', $3, $4)
                ON CONFLICT (student_id, mentor_id) DO UPDATE SET
                    started_at = NOW(),
                    expires_at = NOW() + INTERVAL '30 days',
                    amount_paid = student_mentor_subscriptions.amount_paid + EXCLUDED.amount_paid,
                    transaction_id = EXCLUDED.transaction_id
                `,
                [studentId, mentorId, amount, tx.id]
            );

            await client.query('COMMIT');

            await NotificationService.createNotification(
                mentorId,
                'subscription_new',
                'Yangi obunachi (mablag\' escrow)',
                `Talaba ${amount} MALI to'ldi — 30 kun darsga kirishi mumkin. Mablag' 30 kundan keyin (komissiya ushlab) hisobingizga o'tkaziladi.`,
                { studentId, amount, transactionId: tx.id, escrow: true },
                null
            );

            return { success: true, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), transactionId: tx.id };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    static async getActiveSubscription(studentId: string, mentorId: string) {
        const res = await pool.query(
            `SELECT * FROM student_mentor_subscriptions WHERE student_id = $1 AND mentor_id = $2 AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1`,
            [studentId, mentorId]
        );
        return res.rows[0] || null;
    }
}

