import { pool } from '../config/database';
import { TransactionModel } from '../models/postgres/Transaction';

interface TransferRequest {
    senderId: string;
    receiverId: string;
    amount: number;
    note?: string;
}

export class TokenService {
    private static COMMISSION_RATE = parseFloat(process.env.PLATFORM_COMMISSION_RATE || '0.001');
    private static MIN_TRANSFER = parseFloat(process.env.MIN_TRANSFER_AMOUNT || '10');

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

            // 4. Calculate Fee and Net Amount
            const fee = amount * this.COMMISSION_RATE;
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
        return res.rows[0] || { balance: 0, locked_balance: 0 };
    }
}
