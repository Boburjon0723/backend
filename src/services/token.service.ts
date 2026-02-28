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

    /**
     * Fetch dynamic platform settings: commission_rate and expert_subscription_fee
     */
    static async getPlatformSettings() {
        const res = await pool.query('SELECT * FROM platform_settings ORDER BY id DESC LIMIT 1');
        return res.rows[0] || { expert_subscription_fee: '20.00', commission_rate: '0.10' };
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

            const fee = amount * 0.001; // Simple transfer fee
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
     * Subscribing as an Expert (Deducts 20 MALI, updates user status)
     */
    static async subscribeToExpert(userId: string) {
        const settings = await this.getPlatformSettings();
        const fee = parseFloat(settings.expert_subscription_fee);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Check balance
            const balanceRes = await client.query('SELECT balance FROM token_balances WHERE user_id = $1 FOR UPDATE', [userId]);
            if (!balanceRes.rows[0] || parseFloat(balanceRes.rows[0].balance) < fee) {
                throw new Error("Insufficient funds for subscription");
            }

            // Deduct from user
            await client.query('UPDATE token_balances SET balance = balance - $1 WHERE user_id = $2', [fee, userId]);

            // Add to platform budget
            await client.query('UPDATE platform_balance SET balance = balance + $1, total_fees_collected = total_fees_collected + $1 WHERE id = 1', [fee]);

            // Update user role/status (30 days from now)
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 30);
            await client.query('UPDATE users SET is_expert_active = true, subscription_end_date = $1 WHERE id = $2', [endDate.toISOString(), userId]);

            // Record Transaction
            await TransactionModel.create(client, {
                sender_id: userId,
                receiver_id: null,
                amount: fee,
                fee: 0,
                net_amount: fee,
                type: 'subscription',
                status: 'completed',
                note: 'Monthly Expert Subscription'
            });

            await client.query('COMMIT');
            return { success: true, message: `Successfully subscribed. ${fee} MALI deducted.` };
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
    static async bookSession(studentId: string, expertId: string, amount: number) {
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
                note: 'Session booking escrow'
            });

            // Notify Expert
            await NotificationService.createNotification(
                expertId,
                'booking_new',
                'Yangi darsga yozilish',
                `Talaba sizning darsingizga yozildi. ${amount} MALI kafillikda (escrow).`,
                { transactionId: transaction.id, studentId, amount }
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
        const settings = await this.getPlatformSettings();
        const commissionRate = parseFloat(settings.commission_rate);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Get Transaction
            const txRes = await client.query('SELECT * FROM token_transactions WHERE id = $1 AND status = \'pending\' FOR UPDATE', [transactionId]);
            const tx = txRes.rows[0];
            if (!tx) throw new Error("Pending transaction not found");

            const amount = parseFloat(tx.amount);
            const fee = amount * commissionRate;
            const netAmount = amount - fee;

            // Remove from student's locked balance
            await client.query('UPDATE token_balances SET locked_balance = locked_balance - $1 WHERE user_id = $2', [amount, tx.sender_id]);

            // Credit net amount to Expert
            await client.query('UPDATE token_balances SET balance = balance + $1, lifetime_earned = lifetime_earned + $1 WHERE user_id = $2', [netAmount, tx.receiver_id]);

            // Credit fee to Platform
            await client.query('UPDATE platform_balance SET balance = balance + $1, total_fees_collected = total_fees_collected + $1 WHERE id = 1', [fee]);

            // Mark TX completed
            await client.query('UPDATE token_transactions SET status = \'completed\', fee = $1, net_amount = $2 WHERE id = $3', [fee, netAmount, transactionId]);

            await client.query('COMMIT');
            return { success: true, amount, netAmount, fee };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Get pending bookings for an expert
     */
    static async getExpertBookings(expertId: string) {
        const query = `
            SELECT t.*, u.name as student_name, u.avatar_url as student_avatar
            FROM token_transactions t
            JOIN users u ON t.sender_id = u.id
            WHERE t.receiver_id = $1 AND t.status = 'pending' AND t.type = 'booking'
            ORDER BY t.created_at DESC
        `;
        const res = await pool.query(query, [expertId]);
        return res.rows;
    }
}

