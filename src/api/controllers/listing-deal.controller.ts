import { Request, Response } from 'express';
import { pool } from '../../config/database';
import { TokenService } from '../../services/token.service';

function parseChatMeta(raw: unknown): Record<string, any> {
    if (!raw) return {};
    if (typeof raw === 'object') return raw as Record<string, any>;
    try {
        return JSON.parse(String(raw));
    } catch {
        return {};
    }
}

async function getChatParticipants(chatId: string): Promise<string[]> {
    const r = await pool.query('SELECT user_id FROM chat_participants WHERE chat_id = $1', [chatId]);
    return r.rows.map((x: { user_id: string }) => String(x.user_id));
}

/** E'londan ochilgan shaxsiy chat va ikkala tomon tekshiruvi */
async function assertListingPrivateChat(userId: string, chatId: string) {
    const c = await pool.query('SELECT id, type, metadata FROM chats WHERE id = $1', [chatId]);
    if (!c.rows[0]) return { error: 'Chat topilmadi' as const };
    if (c.rows[0].type !== 'private') return { error: 'Faqat shaxsiy chat' as const };
    const meta = parseChatMeta(c.rows[0].metadata);
    const parts = await getChatParticipants(chatId);
    if (!parts.includes(String(userId))) return { error: 'Kirish rad etildi' as const };

    let expertId = '';
    let clientId = '';

    // 1) Asosiy variant: e'londan ochilgan chat metadata'si bor
    if (meta.source === 'expert_listing' && meta.expert_id) {
        expertId = String(meta.expert_id);
        clientId = parts.find((p) => p !== expertId) || '';
    } else {
        // 2) Fallback: eski private chatlar uchun profile dagi is_expert orqali topish
        const pr = await pool.query(
            `
            SELECT cp.user_id, COALESCE(up.is_expert, FALSE) AS is_expert
            FROM chat_participants cp
            LEFT JOIN user_profiles up ON up.user_id = cp.user_id
            WHERE cp.chat_id = $1
        `,
            [chatId]
        );
        const rows = pr.rows || [];
        const experts = rows.filter((r: any) => r.is_expert === true).map((r: any) => String(r.user_id));

        if (experts.length !== 1) {
            return { error: "Bu chat uchun to'lov oqimi aniqlanmadi" as const };
        }
        expertId = experts[0];
        clientId = parts.find((p) => p !== expertId) || '';
    }

    if (!expertId || !clientId) return { error: 'Ishtirokchilar noto‘g‘ri' as const };
    return { meta, expertId, clientId, participants: parts };
}

export const getDealForChat = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const chatId = req.params.chatId as string;
        const ctx = await assertListingPrivateChat(userId, chatId);
        if ('error' in ctx) return res.status(400).json({ message: ctx.error });

        const d = await pool.query(
            `SELECT * FROM listing_service_deals WHERE chat_id = $1 AND status NOT IN ('completed', 'cancelled') ORDER BY created_at DESC LIMIT 1`,
            [chatId]
        );
        const deal = d.rows[0] || null;
        return res.json({ deal, role: String(userId) === ctx.expertId ? 'expert' : 'client' });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ message: e.message || 'Server error' });
    }
};

export const requestListingPayment = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { chatId, amount } = req.body as { chatId?: string; amount?: number };
        if (!chatId) return res.status(400).json({ message: 'chatId kerak' });

        const ctx = await assertListingPrivateChat(userId, chatId);
        if ('error' in ctx) return res.status(400).json({ message: ctx.error });
        if (String(userId) !== ctx.expertId) {
            return res.status(403).json({ message: "Faqat mutaxassis to'lov so'ray oladi" });
        }

        let amt = typeof amount === 'number' ? amount : parseFloat(String(amount));
        if (!amt || amt <= 0 || Number.isNaN(amt)) {
            const hr = parseFloat(String(ctx.meta.snapshot?.hourly_rate ?? 0));
            amt = hr > 0 ? hr : 100;
        }

        await pool.query(`DELETE FROM listing_service_deals WHERE chat_id = $1 AND status = 'pending_payment'`, [chatId]);

        const ins = await pool.query(
            `INSERT INTO listing_service_deals (chat_id, expert_id, client_id, amount, currency, status)
             VALUES ($1, $2, $3, $4, $5, 'pending_payment')
             RETURNING *`,
            [chatId, ctx.expertId, ctx.clientId, amt, String(ctx.meta.snapshot?.currency || 'MALI')]
        );

        const io = req.app.get('io');
        if (io) {
            io.to(ctx.clientId).emit('listing_deal_updated', { chatId });
            io.to(ctx.expertId).emit('listing_deal_updated', { chatId });
        }

        res.status(201).json({ deal: ins.rows[0] });
    } catch (e: any) {
        console.error(e);
        res.status(500).json({ message: e.message || 'Server error' });
    }
};

export const payListingDeal = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { dealId } = req.body as { dealId?: string };
        if (!dealId) return res.status(400).json({ message: 'dealId kerak' });

        const dr = await pool.query(`SELECT * FROM listing_service_deals WHERE id = $1`, [dealId]);
        const deal = dr.rows[0];
        if (!deal) return res.status(404).json({ message: 'Kelishuv topilmadi' });
        if (String(userId) !== String(deal.client_id)) {
            return res.status(403).json({ message: "Faqat mijoz to'lay oladi" });
        }
        if (deal.status !== 'pending_payment') {
            return res.status(400).json({ message: 'Bu bosqichda tolov qilinmaydi' });
        }

        const ctx = await assertListingPrivateChat(userId, String(deal.chat_id));
        if ('error' in ctx) return res.status(400).json({ message: ctx.error });

        const tx = await TokenService.bookSession(String(deal.client_id), String(deal.expert_id), parseFloat(deal.amount), {
            note: `E'londa xizmat — chat ${deal.chat_id}`,
            metadata: { listing_deal_id: deal.id, chat_id: deal.chat_id }
        });
        await pool.query(
            `UPDATE listing_service_deals SET status = 'escrow_held', transaction_id = $1, updated_at = NOW() WHERE id = $2`,
            [tx.id, deal.id]
        );

        const io = req.app.get('io');
        if (io) {
            io.to(String(deal.client_id)).emit('listing_deal_updated', { chatId: deal.chat_id });
            io.to(String(deal.expert_id)).emit('listing_deal_updated', { chatId: deal.chat_id });
            if (tx.sender_id) io.to(tx.sender_id).emit('balance_updated');
        }

        res.json({ success: true, transactionId: tx.id, autoCompleted: false });
    } catch (e: any) {
        console.error(e);
        res.status(400).json({ message: e.message || 'Tolov amalga oshmadi' });
    }
};

/** Ekspert: xizmat bajarilganini belgilaydi; mablag‘ hali chiqarilmaydi. */
export const markListingDealServiceDone = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { dealId } = req.body as { dealId?: string };
        if (!dealId) return res.status(400).json({ message: 'dealId kerak' });

        const dr = await pool.query(`SELECT * FROM listing_service_deals WHERE id = $1`, [dealId]);
        const deal = dr.rows[0];
        if (!deal) return res.status(404).json({ message: 'Kelishuv topilmadi' });
        if (String(userId) !== String(deal.expert_id)) {
            return res.status(403).json({ message: "Faqat mutaxassis belgilashi mumkin" });
        }
        if (deal.status !== 'escrow_held' || !deal.transaction_id) {
            return res.status(400).json({ message: 'Avval muzlatilgan tolov bo‘lishi kerak' });
        }

        await pool.query(
            `UPDATE listing_service_deals SET status = 'pending_client_confirm', updated_at = NOW() WHERE id = $1`,
            [deal.id]
        );

        const io = req.app.get('io');
        if (io) {
            io.to(String(deal.client_id)).emit('listing_deal_updated', { chatId: deal.chat_id });
            io.to(String(deal.expert_id)).emit('listing_deal_updated', { chatId: deal.chat_id });
        }

        res.json({ success: true });
    } catch (e: any) {
        console.error(e);
        res.status(400).json({ message: e.message || 'Xato' });
    }
};

/** Mijoz: xizmatni qabul qildi — escrowdan mablag‘ mutaxassisga o‘tadi. */
export const completeListingDeal = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { dealId } = req.body as { dealId?: string };
        if (!dealId) return res.status(400).json({ message: 'dealId kerak' });

        const dr = await pool.query(`SELECT * FROM listing_service_deals WHERE id = $1`, [dealId]);
        const deal = dr.rows[0];
        if (!deal) return res.status(404).json({ message: 'Kelishuv topilmadi' });
        if (String(userId) !== String(deal.client_id)) {
            return res.status(403).json({ message: "Faqat mijoz mablag‘ni chiqarishni tasdiqlashi mumkin" });
        }
        if (deal.status !== 'pending_client_confirm' || !deal.transaction_id) {
            return res.status(400).json({
                message:
                    "Mutaxassis xizmatni bajarilgan deb belgilagach, siz tasdiqlashingiz mumkin. Hozircha chiqarish mumkin emas.",
            });
        }

        const result: any = await TokenService.completeSession(String(deal.transaction_id));

        await pool.query(`UPDATE listing_service_deals SET status = 'completed', updated_at = NOW() WHERE id = $1`, [deal.id]);

        const io = req.app.get('io');
        if (io) {
            io.to(String(deal.client_id)).emit('listing_deal_updated', { chatId: deal.chat_id });
            io.to(String(deal.expert_id)).emit('listing_deal_updated', { chatId: deal.chat_id });
            if (result?.senderId) io.to(result.senderId).emit('balance_updated');
            if (result?.receiverId) io.to(result.receiverId).emit('balance_updated');
        }

        res.json({ success: true, ...result });
    } catch (e: any) {
        console.error(e);
        res.status(400).json({ message: e.message || 'Yakunlash muvaffaqiyatsiz' });
    }
};

/** Mijoz: xizmatdan norozi — nizo (dispute) ochadi. */
export const disputeListingDeal = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { dealId } = req.body as { dealId?: string };
        if (!dealId) return res.status(400).json({ message: 'dealId kerak' });

        const dr = await pool.query(`SELECT * FROM listing_service_deals WHERE id = $1`, [dealId]);
        const deal = dr.rows[0];
        if (!deal) return res.status(404).json({ message: 'Kelishuv topilmadi' });
        if (String(userId) !== String(deal.client_id)) {
            return res.status(403).json({ message: "Faqat mijoz nizo ochishi mumkin" });
        }
        if (deal.status !== 'pending_client_confirm') {
            return res.status(400).json({ message: 'Faqat ekspert ishni tugatganidan so‘ng nizo ochish mumkin' });
        }

        await pool.query(
            `UPDATE listing_service_deals SET status = 'disputed', updated_at = NOW() WHERE id = $1`,
            [deal.id]
        );

        const io = req.app.get('io');
        if (io) {
            io.to(String(deal.client_id)).emit('listing_deal_updated', { chatId: deal.chat_id });
            io.to(String(deal.expert_id)).emit('listing_deal_updated', { chatId: deal.chat_id });
        }

        res.json({ success: true, status: 'disputed' });
    } catch (e: any) {
        console.error(e);
        res.status(400).json({ message: e.message || 'Xato' });
    }
};

export const cancelListingDeal = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;
        const { dealId } = req.body as { dealId?: string };
        if (!dealId) return res.status(400).json({ message: 'dealId kerak' });

        const dr = await pool.query(`SELECT * FROM listing_service_deals WHERE id = $1`, [dealId]);
        const deal = dr.rows[0];
        if (!deal) return res.status(404).json({ message: 'Kelishuv topilmadi' });

        if (deal.status === 'pending_payment') {
            if (String(userId) !== String(deal.expert_id) && String(userId) !== String(deal.client_id)) {
                return res.status(403).json({ message: 'Ruxsat yoq' });
            }
            await pool.query(`DELETE FROM listing_service_deals WHERE id = $1`, [deal.id]);
            return res.json({ success: true, cancelled: true });
        }

        if ((deal.status === 'escrow_held' || deal.status === 'pending_client_confirm') && deal.transaction_id) {
            if (String(userId) !== String(deal.expert_id)) {
                return res.status(403).json({ message: 'Muzlatilgan mablagni faqat mutaxassis qaytarishi mumkin' });
            }
            await TokenService.cancelBooking(String(deal.transaction_id), String(deal.expert_id));
            await pool.query(`UPDATE listing_service_deals SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [deal.id]);
            return res.json({ success: true, refunded: true });
        }

        return res.status(400).json({ message: 'Bekor qilish mumkin emas' });
    } catch (e: any) {
        console.error(e);
        res.status(400).json({ message: e.message || 'Xato' });
    }
};
