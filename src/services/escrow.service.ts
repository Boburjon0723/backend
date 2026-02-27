import { pool } from '../config/database';
import { EscrowModel } from '../models/postgres/Escrow';
import { TransactionModel } from '../models/postgres/Transaction';
import { ServiceModel } from '../models/postgres/Service';

export class EscrowService {
    // Default Commission (can be dynamic based on settings)
    private static COMMISSION_RATE = parseFloat(process.env.SERVICE_COMMISSION_PERCENTAGE || '0.05'); // 5%

    /**
     * Hold funds for a service or session (Client -> Escrow)
     */
    static async holdFunds(userId: string, amount: number, reference: { serviceId?: string, bookingId?: string, sessionId?: string }) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // 1. Check User Balance & Lock Row
            const userBalanceRes = await client.query(
                'SELECT balance FROM token_balances WHERE user_id = $1 FOR UPDATE',
                [userId]
            );
            const userBalance = userBalanceRes.rows[0];

            if (!userBalance || parseFloat(userBalance.balance) < amount) {
                throw new Error('Insufficient funds to hold in escrow');
            }

            // 2. Deduct from Available, Add to Locked
            await client.query(
                `UPDATE token_balances 
                 SET balance = balance - $1, 
                     locked_balance = locked_balance + $1 
                 WHERE user_id = $2`,
                [amount, userId]
            );

            // 3. Create Escrow Record
            const escrow = await EscrowModel.create(client, {
                user_id: userId,
                service_id: reference.serviceId,
                booking_id: reference.bookingId,
                amount: amount,
                metadata: { session_id: reference.sessionId }
            });

            // 4. Create Transaction Record (Escrow Hold)
            await TransactionModel.create(client, {
                sender_id: userId,
                receiver_id: null, // Held by system
                amount: amount,
                fee: 0,
                net_amount: amount,
                type: 'escrow_hold',
                status: 'completed',
                reference_type: reference.sessionId ? 'session' : (reference.bookingId ? 'booking' : 'service'),
                reference_id: reference.sessionId || reference.bookingId || reference.serviceId,
                note: `Funds held for ${reference.sessionId ? 'session' : 'service'}`
            });

            await client.query('COMMIT');
            return escrow;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Release funds (Escrow -> Provider)
     */
    static async releaseFunds(escrowId: string) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // 1. Get Escrow Record & Lock
            const escrowRes = await client.query('SELECT * FROM escrow WHERE id = $1 FOR UPDATE', [escrowId]);
            const escrow = escrowRes.rows[0];

            if (!escrow) throw new Error('Escrow record not found');
            if (escrow.status !== 'held') throw new Error(`Escrow status is ${escrow.status}, cannot release`);

            // 2. Determine Provider
            let providerId: string | null = null;
            if (escrow.booking_id) {
                const bookingRes = await client.query('SELECT provider_id FROM bookings WHERE id = $1', [escrow.booking_id]);
                providerId = bookingRes.rows[0]?.provider_id;
            } else if (escrow.metadata?.session_id) {
                const sessionRes = await client.query('SELECT expert_id FROM service_sessions WHERE id = $1', [escrow.metadata.session_id]);
                providerId = sessionRes.rows[0]?.expert_id;
            } else if (escrow.service_id) {
                const serviceRes = await client.query('SELECT provider_id FROM services WHERE id = $1', [escrow.service_id]);
                providerId = serviceRes.rows[0]?.provider_id;
            }

            if (!providerId) throw new Error('Provider not found for escrow release');

            const amount = parseFloat(escrow.amount);
            const commission = amount * this.COMMISSION_RATE;
            const netAmount = amount - commission;

            // 3. Update Payer's Balance (Remove from Locked)
            // We already deducted from 'balance' in holdFunds, now we just reduce 'locked_balance'
            // Wait, 'locked_balance' still holds the tokens. We need to burn/remove them from the payer's total accounting if we are transfering them.
            // Actually, 'locked_balance' is part of the user's total assets but reserved. 
            // When releasing, we simply reduce 'locked_balance'. The 'balance' (available) was already reduced.
            // So the tokens are "gone" from the Payer's PERSPECTIVE of available funds, but still in 'locked'.
            // Now we permanently remove them from Payer.
            await client.query(
                `UPDATE token_balances 
                 SET locked_balance = locked_balance - $1,
                     lifetime_spent = lifetime_spent + $1
                 WHERE user_id = $2`,
                [amount, escrow.user_id]
            );

            // 4. Credit Provider
            await client.query(
                `UPDATE token_balances 
                 SET balance = balance + $1, 
                     lifetime_earned = lifetime_earned + $1 
                 WHERE user_id = $2`,
                [netAmount, providerId]
            );

            // 5. Credit Platform
            await client.query(
                `UPDATE platform_balance 
                 SET balance = balance + $1, 
                     total_commissions_collected = total_commissions_collected + $1 
                 WHERE id = 1`,
                [commission]
            );

            // 6. Update Escrow Status
            const updatedEscrow = await EscrowModel.updateStatus(client, escrowId, 'released');

            // 7. Create Transaction Record (Escrow Release)
            await TransactionModel.create(client, {
                sender_id: escrow.user_id,
                receiver_id: providerId,
                amount: amount,
                fee: commission,
                net_amount: netAmount,
                type: 'escrow_release',
                status: 'completed',
                reference_type: 'escrow',
                reference_id: escrowId,
                note: `Funds released for ${escrow.booking_id ? 'booking' : 'session'}`
            });

            await client.query('COMMIT');
            return updatedEscrow;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Refund funds (Escrow -> Client)
     */
    static async refundFunds(escrowId: string) {
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // 1. Get Escrow Record & Lock
            const escrowRes = await client.query('SELECT * FROM escrow WHERE id = $1 FOR UPDATE', [escrowId]);
            const escrow = escrowRes.rows[0];

            if (!escrow) throw new Error('Escrow record not found');
            if (escrow.status !== 'held') throw new Error(`Escrow status is ${escrow.status}, cannot refund`);

            const amount = parseFloat(escrow.amount);

            // 2. Revert Payer's Balance 
            // Remove from Locked, Add back to Balance
            await client.query(
                `UPDATE token_balances 
             SET locked_balance = locked_balance - $1,
                 balance = balance + $1
             WHERE user_id = $2`,
                [amount, escrow.user_id]
            );

            // 3. Update Escrow Status
            const updatedEscrow = await EscrowModel.updateStatus(client, escrowId, 'refunded');

            // 4. Create Transaction Record (Refund)
            await TransactionModel.create(client, {
                sender_id: escrow.user_id, // Or system
                receiver_id: escrow.user_id,
                amount: amount,
                fee: 0,
                net_amount: amount,
                type: 'refund',
                status: 'completed',
                reference_type: 'escrow',
                reference_id: escrowId,
                note: `Funds refunded for service ${escrow.service_id}`
            });

            await client.query('COMMIT');
            return updatedEscrow;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
}
