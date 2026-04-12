import { pool } from '../config/database';
import { EscrowService } from './escrow.service';

export type ConsultChatFinancialPrepRow = {
    clientUserId: string;
    clientName: string | null;
    clientLockedBalance: number;
    expertServicePrice: number | null;
    session: {
        id: string;
        status: string;
        amountMali: number;
    } | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function num(v: unknown, fallback = 0): number {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Ekspert paneli: mijozning bloklangan (escrow) qismi + shu chat bo‘yicha sessiya / to‘lov.
 * Mijozning umumiy mavjud balansi qaytarilmaydi.
 */
export async function getConsultChatFinancialPrepForExpert(
    expertId: string,
    rawChatId: string
): Promise<ConsultChatFinancialPrepRow> {
    const chatId = String(rawChatId || '').trim();
    if (!chatId || !UUID_RE.test(chatId)) {
        const e: any = new Error('Noto‘g‘ri chatId');
        e.statusCode = 400;
        throw e;
    }

    const eid = String(expertId || '').trim();
    if (!eid) {
        const e: any = new Error('Ekspert aniqlanmadi');
        e.statusCode = 401;
        throw e;
    }

    const chatRes = await pool.query(`SELECT id, type FROM chats WHERE id = $1 LIMIT 1`, [chatId]);
    if (chatRes.rows.length === 0) {
        const e: any = new Error('Chat topilmadi');
        e.statusCode = 404;
        throw e;
    }

    const partRes = await pool.query(
        `SELECT user_id::text AS user_id FROM chat_participants WHERE chat_id = $1`,
        [chatId]
    );
    const participantIds = partRes.rows.map((r) => String(r.user_id));
    if (!participantIds.includes(eid)) {
        const e: any = new Error('Bu chatda ishtirokchi emassiz');
        e.statusCode = 403;
        throw e;
    }

    const clientIds = participantIds.filter((id) => id !== eid);
    const clientUserId = clientIds[0];
    if (!clientUserId) {
        const e: any = new Error('Mijoz ishtirokchisi topilmadi');
        e.statusCode = 400;
        throw e;
    }

    const balRes = await pool.query(
        `SELECT COALESCE(locked_balance, 0) AS locked_balance
         FROM token_balances WHERE user_id = $1::uuid LIMIT 1`,
        [clientUserId]
    );
    const balRow = balRes.rows[0] || { locked_balance: 0 };

    const sessRes = await pool.query(
        `SELECT id::text AS id, status, amount_mali
         FROM service_sessions
         WHERE chat_id = $1 AND expert_id = $2::uuid
         ORDER BY id DESC
         LIMIT 1`,
        [chatId, eid]
    );
    let session: ConsultChatFinancialPrepRow['session'] = null;
    if (sessRes.rows.length > 0) {
        const s = sessRes.rows[0];
        session = {
            id: String(s.id),
            status: String(s.status || ''),
            amountMali: num(s.amount_mali),
        };
    }

    /** E'londan escrow: listing_service_deals + pending `booking` tranzaksiya */
    if (!session) {
        const dealRes = await pool.query(
            `SELECT id::text AS deal_id, amount, transaction_id::text AS transaction_id
             FROM listing_service_deals
             WHERE chat_id = $1::uuid AND expert_id = $2::uuid AND status IN ('escrow_held', 'pending_client_confirm') AND transaction_id IS NOT NULL
             ORDER BY created_at DESC
             LIMIT 1`,
            [chatId, eid]
        );
        if (dealRes.rows.length > 0) {
            const d = dealRes.rows[0];
            const txRes = await pool.query(
                `SELECT id::text, status, amount, type FROM transactions WHERE id = $1::uuid LIMIT 1`,
                [d.transaction_id]
            );
            const tx = txRes.rows[0];
            if (tx && String(tx.status) === 'pending' && String(tx.type) === 'booking') {
                session = {
                    id: String(tx.id),
                    status: 'initiated',
                    amountMali: num(tx.amount, num(d.amount)),
                };
            }
        }
    }

    /** Qo'shimcha: metadata.chat_id bilan bog'langan pending booking (listing to'lovi) */
    if (!session) {
        const txRes = await pool.query(
            `SELECT id::text, amount, status, type
             FROM transactions
             WHERE type = 'booking' AND status = 'pending'
               AND sender_id = $1::uuid AND receiver_id = $2::uuid
               AND (metadata->>'chat_id') = $3
             ORDER BY created_at DESC
             LIMIT 1`,
            [clientUserId, eid, chatId]
        );
        if (txRes.rows.length > 0) {
            const tx = txRes.rows[0];
            session = {
                id: String(tx.id),
                status: 'initiated',
                amountMali: num(tx.amount),
            };
        }
    }

    const priceRes = await pool.query(
        `SELECT service_price, hourly_rate FROM user_profiles WHERE user_id = $1::uuid LIMIT 1`,
        [eid]
    );
    const spRow = priceRes.rows[0];
    const sp =
        spRow?.hourly_rate != null && String(spRow.hourly_rate) !== '' && num(spRow.hourly_rate) > 0
            ? num(spRow.hourly_rate)
            : spRow?.service_price != null && String(spRow.service_price) !== ''
              ? num(spRow.service_price)
              : null;

    const userRes = await pool.query(
        `SELECT name, surname FROM users WHERE id = $1::uuid LIMIT 1`,
        [clientUserId]
    );
    const u = userRes.rows[0];
    const clientName = u ? [u.name, u.surname].filter(Boolean).join(' ').trim() || null : null;

    return {
        clientUserId,
        clientName,
        clientLockedBalance: num(balRow.locked_balance),
        expertServicePrice: sp != null && Number.isFinite(sp) && sp >= 0 ? sp : null,
        session,
    };
}

/** Ekspert: initiated → ongoing (xabar yuborilmasin). */
export async function markConsultSessionOngoingByExpert(expertId: string, rawChatId: string, io: any) {
    const cid = String(rawChatId || '').trim();
    if (!cid) {
        const e: any = new Error('chatId kerak');
        e.statusCode = 400;
        throw e;
    }

    const client = await pool.connect();
    let row: any;
    try {
        await client.query('BEGIN');

        const sessionRes = await client.query(
            `SELECT * FROM service_sessions
             WHERE chat_id = $1 AND expert_id = $2 AND status = 'initiated'
             ORDER BY id DESC
             LIMIT 1
             FOR UPDATE`,
            [cid, expertId]
        );

        if (sessionRes.rows.length > 0) {
            const session = sessionRes.rows[0];
            const updatedRes = await client.query(
                `UPDATE service_sessions
                 SET status = 'ongoing', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
                 WHERE id = $1
                 RETURNING *`,
                [session.id]
            );
            await client.query('COMMIT');
            row = updatedRes.rows[0];
        } else {
            await client.query('ROLLBACK');
            const listingRes = await client.query(
                `SELECT d.*, t.status AS tx_status, t.type AS tx_type
                 FROM listing_service_deals d
                 INNER JOIN transactions t ON t.id = d.transaction_id
                 WHERE d.chat_id = $1::uuid AND d.expert_id = $2::uuid AND d.status IN ('escrow_held', 'pending_client_confirm')
                 ORDER BY d.created_at DESC
                 LIMIT 1`,
                [cid, expertId]
            );
            if (
                listingRes.rows.length === 0 ||
                String(listingRes.rows[0].tx_status) !== 'pending' ||
                String(listingRes.rows[0].tx_type) !== 'booking'
            ) {
                const e: any = new Error(
                    "Faol to'lov (initiated) sessiya topilmadi. Mijoz avval xizmat uchun to'lov qilishi kerak."
                );
                e.statusCode = 404;
                throw e;
            }
            const deal = listingRes.rows[0];
            row = {
                id: String(deal.transaction_id),
                status: 'ongoing',
                chat_id: cid,
                expert_id: expertId,
                client_id: deal.client_id,
                amount_mali: deal.amount,
                source: 'listing_escrow',
            };
        }
    } catch (err) {
        try {
            await client.query('ROLLBACK');
        } catch {
            /* ignore */
        }
        throw err;
    } finally {
        client.release();
    }

    if (io && row) {
        try {
            io.to(row.expert_id).emit('service_session_updated', row);
            io.to(row.client_id).emit('service_session_updated', row);
            io.to(cid).emit('service_session_updated', row);
        } catch (e) {
            console.warn('[consultSession] io emit:', e);
        }
    }

    return row;
}

/**
 * Xizmat/Sessiyani yakunlash va muzlatilgan pulni chiqarish (release).
 */
export async function completeConsultation(expertId: string, sessionId: string, io?: any) {
    const rawId = String(sessionId || '').trim();
    // Extract UUID if it's a lobby ID
    const match = rawId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    const id = match ? match[0] : rawId;

    if (!UUID_RE.test(id)) {
        throw new Error('Noto‘g‘ri sessiya ID');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Check service_sessions
        const sessRes = await client.query(
            `SELECT id, expert_id, client_id, amount_mali, status FROM service_sessions 
             WHERE id = $1 FOR UPDATE`,
            [id]
        );

        let sessionData = sessRes.rows[0];
        let dealData: any = null;

        if (!sessionData) {
            // 2. Check listing_service_deals
            const dealRes = await client.query(
                `SELECT * FROM listing_service_deals 
                 WHERE (id = $1 OR transaction_id = $1) AND expert_id = $2 
                 FOR UPDATE`,
                [id, expertId]
            );
            dealData = dealRes.rows[0];
        }

        if (!sessionData && !dealData) {
            throw new Error('Sessiya yoki kelishuv topilmadi');
        }

        // 3. Status check
        const currentStatus = sessionData?.status || dealData?.status;
        if (currentStatus === 'completed' || currentStatus === 'released') {
            await client.query('COMMIT');
            return { alreadyCompleted: true };
        }

        // 4. Find Escrow to release
        const escrowRes = await client.query(
            `SELECT id FROM escrow 
             WHERE (metadata->>'session_id' = $1 OR id = $1 OR booking_id = (SELECT id FROM bookings WHERE transaction_id = $1 LIMIT 1))
             AND status = 'held' LIMIT 1`,
            [id]
        );

        if (escrowRes.rows.length > 0) {
            const escrowId = escrowRes.rows[0].id;
            await EscrowService.releaseFunds(escrowId);
        }

        // 5. Update Statuses
        if (sessionData) {
            await client.query(
                `UPDATE service_sessions SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
                [sessionData.id]
            );
        }
        if (dealData) {
            await client.query(
                `UPDATE listing_service_deals SET status = 'completed', updated_at = NOW() WHERE id = $1`,
                [dealData.id]
            );
            if (dealData.transaction_id) {
                await client.query(
                    `UPDATE transactions SET status = 'completed', updated_at = NOW() WHERE id = $1 AND status = 'pending'`,
                    [dealData.transaction_id]
                );
            }
        }

        await client.query('COMMIT');

        if (io) {
            const eid = sessionData?.expert_id || dealData?.expert_id;
            const cid = sessionData?.client_id || dealData?.client_id;
            const updatePayload = { id, status: 'completed' };
            if (eid) io.to(eid).emit('service_session_updated', updatePayload);
            if (cid) io.to(cid).emit('service_session_updated', updatePayload);
        }

        return { success: true, id };

    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}
