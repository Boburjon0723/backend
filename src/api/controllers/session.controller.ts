import { Request, Response } from 'express';
import { LiveSessionModel, ChatModel } from '../../models/postgres/LiveSession';
import { MessageModel } from '../../models/postgres/Message';
import { ChatModel as PgChatModel } from '../../models/postgres/Chat';
import { pool } from '../../config/database';
import {
    isLiveKitRecordingConfigured,
    startRoomCompositeRecording,
    stopRoomRecordingAndResolveUrl,
    buildRecordingStagingKey,
} from '../../services/livekitRecording.service';
import { completeConsultation } from '../../services/consultSession.service';

/** Guruh darslari: a’zo yoki guruh yaratuvchisi (mentor) yozib olishi mumkin. */
async function assertMentorRecordingAccess(userId: string, chatId: string) {
    const chat = await PgChatModel.findById(chatId);
    if (!chat || chat.type !== 'group') {
        return { ok: false as const, chat: null };
    }
    const isCreator = chat.creator_id != null && String(chat.creator_id) === String(userId);
    const part = await pool.query(
        'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
        [chatId, userId]
    );
    if (!isCreator && !part.rows.length) {
        return { ok: false as const, chat: null };
    }
    return { ok: true as const, chat };
}

export const getLiveSessionState = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sessionId } = req.params;
        const userId = (req as any).user?.id;
        if (!userId || !sessionId) {
            res.status(400).json({ error: 'Noto\'g\'ri so\'rov' });
            return;
        }
        const access = await assertMentorRecordingAccess(userId, sessionId as string);
        if (!access.ok) {
            res.status(403).json({ error: 'Guruhga kirish rad etildi' });
            return;
        }
        const state = await LiveSessionModel.getSessionPublic(sessionId as string);
        res.status(200).json(state);
    } catch (error) {
        console.error('getLiveSessionState:', error);
        res.status(500).json({ error: 'Holatni olishda xatolik' });
    }
};

export const getSessionChatHistory = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sessionId } = req.params;
        const messages = await ChatModel.getSessionMessages(sessionId as string, 100, 0);
        res.status(200).json(messages);
    } catch (error) {
        console.error('Error fetching session chats:', error);
        res.status(500).json({ error: 'Failed to fetch session chats' });
    }
};

export const startSessionRecording = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sessionId } = req.params;
        const userId = (req as any).user?.id;
        if (!userId || !sessionId) {
            res.status(400).json({ error: 'Sessiya aniqlanmadi' });
            return;
        }
        const access = await assertMentorRecordingAccess(userId, sessionId as string);
        if (!access.ok) {
            res.status(403).json({ error: 'Bu guruhda yozib olishga ruxsat yo‘q' });
            return;
        }
        const title = access.chat?.name || null;
        console.log(`[Recording] Start for room ${sessionId} (mentor ${userId})`);
        const row = await LiveSessionModel.upsertRecordingStart(sessionId as string, userId, title);
        let egressActive = false;
        if (isLiveKitRecordingConfigured()) {
            try {
                const stagingKey = buildRecordingStagingKey(sessionId as string);
                const egressId = await startRoomCompositeRecording(sessionId as string, stagingKey);
                await LiveSessionModel.updateEgressMeta(sessionId as string, egressId, stagingKey);
                egressActive = true;
            } catch (e) {
                console.error('[Recording] LiveKit Egress boshlanmadi (S3/LIVEKIT tekshiring):', e);
            }
        }
        res.status(200).json({
            message: 'Yozib olish boshlandi',
            status: 'recording',
            session: row,
            egressActive,
        });
    } catch (error) {
        console.error('Error starting recording:', error);
        res.status(500).json({ error: 'Yozib olishni boshlashda xatolik' });
    }
};

export const stopSessionRecording = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sessionId } = req.params;
        const userId = (req as any).user?.id;
        if (!userId || !sessionId) {
            res.status(400).json({ error: 'Sessiya aniqlanmadi' });
            return;
        }
        const access = await assertMentorRecordingAccess(userId, sessionId as string);
        if (!access.ok) {
            res.status(403).json({ error: 'Bu guruhda yozib olishni to‘xtatishga ruxsat yo‘q' });
            return;
        }
        const bodyUrl = req.body?.recordingUrl || req.body?.url;
        const title = access.chat?.name || null;

        const existing = await LiveSessionModel.getSession(sessionId as string);
        const egressId = existing?.egress_id as string | undefined;
        const stagingKey = (existing?.recording_staging_key as string) || null;

        let recordingUrl =
            typeof bodyUrl === 'string' && bodyUrl.trim()
                ? bodyUrl.trim()
                : `https://mali-recordings.s3.amazonaws.com/${sessionId}.mp4`;

        if (egressId) {
            const resolved = await stopRoomRecordingAndResolveUrl(egressId, stagingKey);
            await LiveSessionModel.clearEgressMeta(sessionId as string);
            if (resolved) {
                recordingUrl = resolved;
            }
        }
        const row = await LiveSessionModel.upsertRecordingFinish(
            sessionId as string,
            userId,
            recordingUrl,
            title
        );

        // Send recording link to chat automatically
        try {
            const msg = await MessageModel.create(
                sessionId as string,
                userId,
                recordingUrl,
                'video',
                { title: 'Dars yozuvi', isRecording: true }
            );
            const io = req.app.get('io');
            if (io) {
                io.to(sessionId as string).emit('receive_message', {
                    ...msg,
                    chat_id: sessionId,
                    roomId: sessionId,
                    sender_id: userId,
                    content: recordingUrl,
                    type: 'video',
                    created_at: msg.created_at,
                });
            }
        } catch (msgErr) {
            console.warn(`[Recording] Failed to post recording message to chat:`, msgErr);
        }

        // AUTO-COMPLETE Consultation & Release Escrow
        try {
            await completeConsultation(userId, sessionId as string, req.app.get('io'));
            console.log(`[Recording] Auto-completed consultation for session ${sessionId}`);
        } catch (completeErr) {
            console.warn(`[Recording] Auto-complete failed (might not be a consult session):`, completeErr);
        }

        res.status(200).json({ message: 'Yozib olish tugatildi', url: recordingUrl, session: row });
    } catch (error) {
        console.error('Error stopping recording:', error);
        res.status(500).json({ error: 'Yozib olishni to‘xtatishda xatolik' });
    }
};

/** Yozuvni guruh chatiga xabar qilib yuborish. */
export const recordingDoneToChat = async (req: Request, res: Response): Promise<void> => {
    try {
        const raw = req.params.sessionId;
        const rawSessionId = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] ?? '' : '';
        const { recordingUrl } = req.body || {};
        const userId = (req as any).user?.id;
        
        if (!userId || !recordingUrl || typeof recordingUrl !== 'string') {
            res.status(400).json({ message: 'recordingUrl kerak' });
            return;
        }

        // Clean UUID (handle lobby prefixes)
        const match = rawSessionId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        const chatId = match ? match[0] : rawSessionId;

        const chat = await PgChatModel.findById(chatId);
        if (!chat) {
            res.status(404).json({ message: 'Chat topilmadi' });
            return;
        }
        
        // Remove 'group' only restriction
        if (chat.type !== 'group' && chat.type !== 'private') {
            res.status(400).json({ message: 'Ushbu chat turi uchun yozuv yuborib bo\'lmaydi' });
            return;
        }
        const { pool } = await import('../../config/database');
        const part = await pool.query(
            'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
            [chatId, userId]
        );
        if (!part.rows.length) {
            res.status(403).json({ message: 'Siz ushbu guruh a\'zosi emassiz' });
            return;
        }
        const msg = await MessageModel.create(
            chatId,
            userId,
            recordingUrl,
            'video',
            { title: 'Dars yozuvi', isRecording: true }
        );
        try {
            await LiveSessionModel.updateRecording(chatId, recordingUrl);
        } catch (_) {}
        const io = req.app.get('io');
        if (io) {
            io.to(chatId).emit('receive_message', {
                ...msg,
                chat_id: chatId,
                roomId: chatId,
                sender_id: userId,
                content: recordingUrl,
                type: 'video',
                created_at: msg.created_at,
            });
        }
        res.status(201).json({ success: true, message: msg });
    } catch (error: any) {
        console.error('recordingDoneToChat error:', error);
        res.status(500).json({ error: error?.message || 'Xabar yuborishda xatolik' });
    }
};

export const getSessionHistory = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user!.id;
        // Assume user is a mentor and fetch their past sessions with recordings
        const history = await LiveSessionModel.getMentorSessionHistory(userId);
        res.status(200).json(history);
    } catch (error) {
        console.error('Error fetching session history:', error);
        res.status(500).json({ error: 'Failed to fetch session history' });
    }
};
