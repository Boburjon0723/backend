import { Request, Response } from 'express';
import { MessageModel } from '../../models/postgres/Message';
import { ChatModel } from '../../models/postgres/Chat';
import { pool } from '../../config/database';
import { safeDelCache } from '../../config/redis';

export const sendMessage = async (req: Request, res: Response) => {
    try {
        const bot = (req as any).bot;
        const { chatId, content, type } = req.body || {};

        if (!chatId || typeof chatId !== 'string') {
            return res.status(400).json({ message: 'chatId kerak' });
        }
        if (!content || typeof content !== 'string') {
            return res.status(400).json({ message: 'content kerak' });
        }

        const chat = await ChatModel.findById(chatId);
        if (!chat) return res.status(404).json({ message: 'Chat topilmadi' });

        const participantRow = await pool.query(
            'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
            [chatId, bot.user_id]
        );
        if (!participantRow.rows.length) {
            return res.status(403).json({ message: 'Bot ushbu chat a\'zosi emas' });
        }

        if (chat.type === 'channel' && chat.creator_id !== bot.user_id) {
            return res.status(403).json({ message: 'Kanalda faqat yaratuvchi xabar yuborishi mumkin' });
        }

        const messageType = (type && ['text', 'image', 'file', 'voice'].includes(type)) ? type : 'text';
        const metadata = { botId: bot.id, botName: bot.name };

        const savedMessage = await MessageModel.create(
            chatId,
            bot.user_id,
            content,
            messageType,
            metadata,
            null
        );

        const io = req.app.get('io');
        if (io) {
            io.to(chatId).emit('receive_message', {
                ...savedMessage,
                roomId: chatId,
                sender_name: bot.name,
                sender_avatar: null
            });
        }

        try {
            const participantsRes = await pool.query('SELECT user_id FROM chat_participants WHERE chat_id = $1', [chatId]);
            for (const row of participantsRes.rows) {
                await safeDelCache(`user_chats:${row.user_id}`);
            }
        } catch (e) {
            console.error('[Bot sendMessage] Cache invalidation error:', e);
        }

        res.status(201).json({ message: savedMessage });
    } catch (err) {
        console.error('Bot sendMessage error:', err);
        res.status(500).json({ message: 'Server xatosi' });
    }
};

/** Telegram botdan kelgan kontakt asosida foydalanuvchi telefon raqamini yangilash. */
export const updateUserPhoneFromTelegram = async (req: Request, res: Response) => {
    try {
        const { chatId, phone } = req.body as { chatId?: number | string; phone?: string };

        if (!chatId || !phone) {
            return res.status(400).json({ message: 'chatId va phone kerak' });
        }

        const normalizedPhone = String(phone).trim();
        if (!normalizedPhone || normalizedPhone.length < 7) {
            return res.status(400).json({ message: 'phone noto‘g‘ri formatda' });
        }

        const numericChatId = typeof chatId === 'string' ? parseInt(chatId, 10) : chatId;
        if (!numericChatId || Number.isNaN(numericChatId)) {
            return res.status(400).json({ message: 'chatId noto‘g‘ri formatda' });
        }

        const result = await pool.query(
            'UPDATE users SET phone = $1 WHERE telegram_chat_id = $2 RETURNING id, phone',
            [normalizedPhone, numericChatId]
        );

        if (!result.rows.length) {
            return res.status(404).json({ message: 'telegram_chat_id bo‘yicha foydalanuvchi topilmadi' });
        }

        return res.json({ success: true, userId: result.rows[0].id, phone: result.rows[0].phone });
    } catch (err) {
        console.error('updateUserPhoneFromTelegram error:', err);
        return res.status(500).json({ message: 'Server xatosi' });
    }
};
