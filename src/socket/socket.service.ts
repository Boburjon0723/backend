import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { MessageModel } from '../models/postgres/Message';
import { TokenService } from '../services/token.service';
import { ServiceModel } from '../models/postgres/Service';
import { UserModel } from '../models/postgres/User';
import { pool } from '../config/database';
import { NotificationService } from '../services/notification.service';
import { safeDelCache, addUserToOnline, removeUserFromOnline } from '../config/redis';


async function getJoinerProfileForSession(userId: string | undefined) {
    if (!userId) return null;
    try {
        return await UserModel.findById(String(userId));
    } catch (e) {
        console.warn('[Socket] getJoinerProfileForSession:', e);
        return null;
    }
}

/** Dars xonasida talaba mikrofonini boshqarish / qo‘lni yechish — guruh yaratuvchisi yoki guruh a’zosi ekspert */
async function verifyUserCanControlSession(sessionId: string, userId: string): Promise<boolean> {
    try {
        const cq = await pool.query(`SELECT creator_id, type FROM chats WHERE id = $1 LIMIT 1`, [sessionId]);
        const row = cq.rows[0];
        if (!row) return false;
        if (String(row.creator_id) === String(userId)) return true;
        const member = await pool.query(
            `SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2 LIMIT 1`,
            [sessionId, userId]
        );
        if (member.rows.length === 0) return false;
        const u = await UserModel.findById(String(userId));
        return !!(u && u.is_expert === true);
    } catch (e) {
        console.warn('[Socket] verifyUserCanControlSession:', e);
        return false;
    }
}

/** Shaxsiy chat: panel taklifi matni (huquqshunos / psixolog / umumiy konsultant) */
function consultPanelInviteChatContent(
    expertName: string,
    sessionStyle: 'mentor' | 'consult' | 'legal' | 'psychology'
): string {
    if (sessionStyle === 'mentor') {
        return `👋 **${expertName}** ustoz panelida. Agar darsni boshlagan bo'lsa, quyidagi tugma orqali qo'shilishingiz mumkin.`;
    }
    if (sessionStyle === 'legal') {
        return `⚖️ **${expertName}** huquqiy maslahat uchun tayyor. Maslahat xonasiga kirish uchun quyidagi tugmani bosing.`;
    }
    if (sessionStyle === 'psychology') {
        return `🌿 **${expertName}** psixologik maslahat o‘tkazishga tayyor. Xavfsiz uchrashuv uchun quyidagi tugmani bosing.`;
    }
    return `📞 **${expertName}** onlayn konsultatsiya uchun tayyor. Uchrashuvni boshlash uchun quyidagi tugmani bosing.`;
}

/** PG `Date` / string — socket JSON da `created_at` doim mavjud bo‘lishi uchun ISO string */
function messageCreatedAtToIso(row: { created_at?: Date | string | null }): string {
    const c = row.created_at;
    if (c == null) return new Date().toISOString();
    if (c instanceof Date) return c.toISOString();
    if (typeof c === 'string') {
        const t = Date.parse(c);
        return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
    }
    return new Date().toISOString();
}

/** Chatga tushadigan matn: dars (mentor) yoki konsultatsiya sessiyasi */
function lessonNotifyChatContent(
    mentorName: string,
    phase: 'start' | 'end',
    sessionStyle?: 'mentor' | 'consult'
) {
    const isClassroom = sessionStyle !== 'consult';
    if (phase === 'start') {
        return isClassroom
            ? `🚀 Ustoz ${mentorName} darsni boshladi!`
            : `🚀 Mutaxassis ${mentorName} konsultatsiya sessiyasini boshladi!`;
    }
    return isClassroom
        ? `📋 **Dars yakunlandi.** Ustoz ${mentorName} darsni tugatdi.`
        : `📋 **Sessiya yakunlandi.** ${mentorName} uchrashuvni tugatdi.`;
}

// Ensure the AuthenticatedSocket interface matches actual usage
interface AuthenticatedSocket extends Socket {
    user?: any;
}

export class SocketService {
    private io: Server;


    constructor(io: Server) {
        this.io = io;
        this.initialize();
    }

    private initialize() {
        this.io.use((socket: Socket, next) => {
            try {
                const token = socket.handshake.auth.token || socket.handshake.query.token;
                if (!token) {
                    return next(new Error('Authentication error: Token required'));
                }

                const secret = process.env.JWT_SECRET;
                if (!secret) return next(new Error('Server configuration error'));

                jwt.verify(token as string, secret, (err: any, decoded: any) => {
                    if (err) return next(new Error('Authentication error: Invalid token'));
                    (socket as AuthenticatedSocket).user = decoded;
                    next();
                });
            } catch (error) {
                next(new Error('Authentication error'));
            }
        });

        this.io.on('connection', (socket: Socket) => {
            const authSocket = socket as AuthenticatedSocket;
            const userId = authSocket.user?.id;

            console.log(`User connected: ${userId}`);

            // Track Online Status in Redis
            if (userId) {
                addUserToOnline(userId, socket.id).then(() => {
                    // Broadcast 'user_online'
                    this.io.emit('user_status_change', { userId, status: 'online' });
                });
            }

            // Join personal room for private messages
            authSocket.join(authSocket.user.id);

            authSocket.on('join_room', async (roomId: string) => {
                try {
                    const normalizedRoomId = String(roomId || '').trim();
                    if (!normalizedRoomId) return;

                    // Always allow the personal room used for direct user-targeted events.
                    if (normalizedRoomId === String(authSocket.user.id)) {
                        authSocket.join(normalizedRoomId);
                        return;
                    }

                    // Chat rooms are UUIDs; user must be a participant to join.
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    if (!uuidRegex.test(normalizedRoomId)) {
                        authSocket.emit('error', { message: 'Ruxsatsiz xona' });
                        return;
                    }

                    const participant = await pool.query(
                        `SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2 LIMIT 1`,
                        [normalizedRoomId, authSocket.user.id]
                    );
                    if (participant.rows.length === 0) {
                        authSocket.emit('error', { message: 'Bu xonaga kirish huquqi yo‘q' });
                        return;
                    }

                    authSocket.join(normalizedRoomId);
                    console.log(`[Socket] User ${authSocket.user.id} joined room ${normalizedRoomId}`);
                } catch (e) {
                    console.warn('[Socket] join_room authorization error:', e);
                    authSocket.emit('error', { message: 'Xonaga ulanishda xatolik' });
                }
            });

            authSocket.on('session_join', async (data: { sessionId: string }) => {
                const { sessionId } = data;
                authSocket.join(sessionId);
                console.log(`[Socket] User ${authSocket.user.id} joined session ${sessionId}`);

                let joinerIsMentor = false;
                try {
                    // Check if it's a valid UUID before querying PostgreSQL
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    if (uuidRegex.test(sessionId)) {
                        const cq = await pool.query(
                            `SELECT creator_id, type FROM chats WHERE id = $1 LIMIT 1`,
                            [sessionId]
                        );
                        const row = cq.rows[0];
                        if (row?.type === 'private') {
                            const joiner = await UserModel.findById(String(authSocket.user.id));
                            joinerIsMentor = !!(joiner && joiner.is_expert === true);
                        } else if (row) {
                            const creatorId = row.creator_id;
                            joinerIsMentor =
                                creatorId != null &&
                                String(creatorId) === String(authSocket.user.id);
                        }
                    } else {
                        console.log(`[Socket] session_join: Skipping DB lookup for non-UUID / lobby sessionId: ${sessionId}`);
                    }
                } catch (e) {
                    console.warn('[Socket] session_join creator lookup:', e);
                }

                const profile = await getJoinerProfileForSession(authSocket.user?.id);
                const fullName = profile
                    ? [profile.name, profile.surname].filter(Boolean).join(' ').trim()
                    : '';
                const displayName =
                    fullName ||
                    profile?.phone ||
                    authSocket.user?.name ||
                    authSocket.user?.phone ||
                    'User';
                const avatarUrl =
                    profile?.avatar_url ||
                    authSocket.user?.avatar_url ||
                    authSocket.user?.avatar ||
                    null;

                authSocket.to(sessionId).emit('participant_joined', {
                    id: authSocket.user.id,
                    name: displayName,
                    avatar: avatarUrl,
                    avatar_url: avatarUrl,
                    isMentor: joinerIsMentor
                });
            });

            authSocket.on('send_message', async (data: { roomId: string, content: string, type?: string, clientSideId?: string, caption?: string, metadata?: any, parentId?: string }) => {
                try {
                    const { roomId, content, type, clientSideId, caption, metadata, parentId } = data;

                    const chatRow = (await pool.query(`SELECT type, creator_id FROM chats WHERE id = $1`, [roomId])).rows[0];
                    if (!chatRow) {
                        return authSocket.emit('error', { message: 'Chat topilmadi' });
                    }

                    if (chatRow.type === 'channel') {
                        if (chatRow.creator_id !== authSocket.user.id) {
                            return authSocket.emit('error', { message: 'Faqat kanal yaratuvchisi xabar, fayl va materiallar qo\'yishi mumkin' });
                        }
                    }

                    if (chatRow.type === 'private') {
                        const participants = await pool.query(`SELECT user_id FROM chat_participants WHERE chat_id = $1`, [roomId]);
                        const otherParticipant = participants.rows.find((p: any) => p.user_id !== authSocket.user.id);
                        if (otherParticipant) {
                            const isBlocked = await UserModel.isBlocked(authSocket.user.id, otherParticipant.user_id);
                            if (isBlocked) {
                                return authSocket.emit('error', { message: 'Xabar yuborish imkonsiz: Foydalanuvchi bloklangan' });
                            }
                        }
                    }

                    // 1. Save to Postgres
                    const savedMessage = await MessageModel.create(
                        roomId,
                        authSocket.user.id,
                        content,
                        type || 'text',
                        {
                            ...(metadata || {}),
                            senderName: authSocket.user.name || authSocket.user.phone || "Unknown User",
                            caption: caption
                        },
                        parentId
                    );

                    let broadcastSenderName =
                        authSocket.user.name || authSocket.user.phone || 'Unknown User';
                    let broadcastSenderAvatar: string | null =
                        authSocket.user.avatar_url || null;
                    try {
                        const ur = await pool.query(
                            `SELECT name, surname, avatar_url FROM users WHERE id = $1 LIMIT 1`,
                            [authSocket.user.id]
                        );
                        const urow = ur.rows[0];
                        if (urow) {
                            const full = [urow.name, urow.surname].filter(Boolean).join(' ').trim();
                            if (full) broadcastSenderName = full;
                            if (urow.avatar_url) broadcastSenderAvatar = urow.avatar_url;
                        }
                    } catch (e) {
                        console.warn('[Socket] send_message sender profile lookup:', e);
                    }

                    // 2. Broadcast to room (including sender for confirmation)
                    const createdAtIso = messageCreatedAtToIso(savedMessage);
                    const receivePayload = {
                        id: savedMessage.id,
                        chat_id: savedMessage.chat_id,
                        roomId: roomId,
                        sender_id: savedMessage.sender_id,
                        content: savedMessage.content,
                        type: savedMessage.type,
                        metadata: savedMessage.metadata,
                        parent_id: savedMessage.parent_id,
                        created_at: createdAtIso,
                        clientSideId: clientSideId,
                        sender_name: broadcastSenderName,
                        sender_avatar: broadcastSenderAvatar,
                        is_read: savedMessage.is_read,
                    };
                    this.io.to(roomId).emit('receive_message', receivePayload);

                    // 2.5 Cache Invalidation
                    try {
                        const participantsRes = await pool.query('SELECT user_id FROM chat_participants WHERE chat_id = $1', [roomId]);
                        for (const row of participantsRes.rows) {
                            await safeDelCache(`user_chats:${row.user_id}`);
                        }
                    } catch (cacheErr) {
                        console.error('[Socket Cache Inval] Error:', cacheErr);
                    }

                    // 3. Bot Logic check
                    if (content.startsWith('/')) {
                        await this.handleBotCommand(authSocket, roomId, content);
                    }

                } catch (error) {
                    console.error('Send message error:', error);
                    authSocket.emit('error', { message: 'Failed to send message' });
                }
            });

            // Read Receipts
            authSocket.on('mark_messages_read', async (data: { roomId: string, messageIds: string[] }) => {
                try {
                    const { roomId, messageIds } = data;
                    const userId = authSocket.user.id;

                    // Mark as read in DB
                    const updatedMessageIds = await MessageModel.markAsRead(roomId, messageIds, userId);

                    if (updatedMessageIds.length > 0) {
                        // Broadcast to everyone in the room (including sender) that these messages were read
                        this.io.to(roomId).emit('messages_read', {
                            roomId,
                            messageIds: updatedMessageIds,
                            readBy: userId
                        });
                    }
                } catch (error) {
                    console.error('Mark messages read error:', error);
                }
            });

            // WebRTC & LiveKit Call Signaling
            authSocket.on('call_user', (data: { targetUserId: string; fromName: string; signal: any; callType: string }) => {
                this.io.to(data.targetUserId).emit('incoming_call', { 
                    from: authSocket.user.id, 
                    name: data.fromName || authSocket.user.name || authSocket.user.phone || 'User',
                    signal: data.signal,
                    callType: data.callType
                });
            });

            authSocket.on('accept_call', (data: { to: string; signal: any }) => {
                this.io.to(data.to).emit('call_accepted', { signal: data.signal });
            });

            authSocket.on('reject_call', (data: { to: string }) => {
                this.io.to(data.to).emit('call_rejected');
            });

            authSocket.on('end_call', (data: { to: string }) => {
                this.io.to(data.to).emit('call_ended');
            });

            authSocket.on('booking_accept', async (data: { studentId: string, url: string }) => {
                try {
                    const { NotificationService } = await import('../services/notification.service');
                    await NotificationService.createNotification(
                        data.studentId,
                        'booking_accepted',
                        'Dars boshlandi',
                        `Sizning darsingiz qabul qilindi. Xonaga qo'shilish uchun quyidagi tugmani bosing:`,
                        { url: data.url },
                        this.io
                    );
                } catch (error) {
                    console.error('Failed to notify student of accepted booking:', error);
                }
            });

            authSocket.on('call_signal', (data: { to: string; signal: any }) => {
                this.io.to(data.to).emit('call_signal', { signal: data.signal, from: authSocket.user.id });
            });

            authSocket.on('typing', (roomId: string) => {
                authSocket.to(roomId).emit('typing', { senderId: authSocket.user.id, roomId });
            });

            authSocket.on('stop_typing', (roomId: string) => {
                authSocket.to(roomId).emit('stop_typing', { senderId: authSocket.user.id, roomId });
            });

            // Live Session Chat System
            authSocket.on('session_chat:send', async (data: { sessionId: string, receiverId?: string, content: string, fileUrl?: string, type?: string }) => {
                try {
                    const { sessionId, receiverId, content, fileUrl, type } = data;
                    const { ChatModel } = await import('../models/postgres/LiveSession');

                    const broadcastMsg = await ChatModel.saveMessage(
                        sessionId,
                        authSocket.user.id,
                        receiverId || null,
                        content,
                        fileUrl || null,
                        type || 'text'
                    );

                    // Broadcast to specific receiver or entire room
                    if (receiverId) {
                        this.io.to(receiverId).emit('session_chat:receive', broadcastMsg);
                        authSocket.emit('session_chat:receive', broadcastMsg); // echo to sender
                    } else {
                        this.io.to(sessionId).emit('session_chat:receive', broadcastMsg);
                    }
                } catch (error) {
                    console.error('Session chat error:', error);
                    authSocket.emit('error', { message: 'Failed to send session chat' });
                }
            });

            // Lesson Start Event (Mentor clicks 'Boshlash')
            authSocket.on(
                'lesson_start',
                async (data: {
                    sessionId: string;
                    mentorName: string;
                    /** frontend: getExpertPanelMode !== mentor */
                    sessionStyle?: 'mentor' | 'consult';
                }) => {
                try {
                    const { sessionId, mentorName, sessionStyle } = data;
                    const userId = authSocket.user.id;
                    console.log(`[Socket] lesson_start received: sessionId=${sessionId}, mentorName=${mentorName}, userId=${userId}`);

                    const { MessageModel } = await import('../models/postgres/Message');
                    const { pool } = await import('../config/database');

                    // 1. IMPROVED LOOKUP: Find group chat where this mentor is a participant and the chat name or ID matches session
                    let chatId: string | null = null;
                    // Option A: Check if sessionId is a valid chatId (UUID)
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    if (uuidRegex.test(sessionId)) {
                        const checkDirect = await pool.query(
                            'SELECT chat_id FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
                            [sessionId, userId]
                        );

                        if ((checkDirect.rowCount ?? 0) > 0) {
                            chatId = sessionId;
                            console.log(`[Socket] Found direct chatId match: ${chatId}`);
                        }
                    }

                    // Option B: Search for a group chat where the name matches the sessionId (fallback)
                    if (!chatId) {
                        const checkByName = await pool.query(`
                            SELECT c.id FROM chats c
                            JOIN chat_participants cp ON c.id = cp.chat_id
                            WHERE c.type = 'group' AND cp.user_id = $1 AND c.name = $2
                            LIMIT 1
                        `, [userId, sessionId]);

                        if ((checkByName.rowCount ?? 0) > 0) {
                            chatId = checkByName.rows[0].id;
                            console.log(`[Socket] Found chatId by name match: ${chatId}`);
                        }
                    }

                    if (!chatId) {
                        console.warn(`[Socket] lesson_start: No chatId found for expert ${userId} with sessionId ${sessionId}`);
                    }

                    if (chatId) {
                        const mentor = await UserModel.findById(userId);
                        const mentorAvatar = mentor?.avatar_url || authSocket.user?.avatar_url || null;
                        const startContent = lessonNotifyChatContent(mentorName, 'start', sessionStyle);

                        const startMeta = { sessionId: sessionId, sessionStyle: sessionStyle ?? 'mentor' };
                        const newMessage = await MessageModel.create(
                            chatId,
                            userId,
                            startContent,
                            'lesson_start',
                            startMeta
                        );
                        console.log(`[Socket] Created DB message:`, newMessage.id);

                        this.io.to(chatId).emit('receive_message', {
                            id: newMessage.id,
                            chat_id: chatId,
                            roomId: chatId,
                            sender_id: userId,
                            sender_name: mentorName,
                            sender_avatar: mentorAvatar,
                            content: startContent,
                            type: 'lesson_start',
                            metadata: startMeta,
                            created_at: new Date().toISOString()
                        });

                        console.log(`[Socket] Lesson started for session ${sessionId}, notified chat ${chatId}`);
                    } else {
                        console.warn(`[Socket] Could not determine chatId for session: ${sessionId}. User ${userId} is not in a matching group.`);
                    }
                } catch (error) {
                    console.error('[Socket] lesson_start error:', error);
                }
            });

            /** Huquqshunos / psixolog / konsultant panelni ochganda mijoz chatiga taklif + ulanish tugmasi */
            authSocket.on(
                'consult_panel_invite',
                async (data: {
                    chatId: string;
                    expertName: string;
                    sessionStyle?: 'mentor' | 'consult' | 'legal' | 'psychology';
                    isPaymentRequest?: boolean;
                }) => {
                    try {
                        const { chatId, expertName, sessionStyle, isPaymentRequest } = data;
                        const userId = authSocket.user.id;
                        if (!chatId || !expertName) return;

                        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                        if (!uuidRegex.test(String(chatId))) return;

                        const { pool } = await import('../config/database');
                        const { MessageModel } = await import('../models/postgres/Message');

                        const part = await pool.query(
                            'SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2 LIMIT 1',
                            [chatId, userId]
                        );
                        if ((part.rowCount ?? 0) === 0) {
                            console.warn('[Socket] consult_panel_invite: not a participant', chatId, userId);
                            return;
                        }

                        /** Har bir «Qabul xabari» yuborilishi kerak; avtomatik taklif frontendda yo‘q */
                        const style: 'mentor' | 'consult' | 'legal' | 'psychology' =
                            sessionStyle === 'mentor'
                                ? 'mentor'
                                : sessionStyle === 'legal'
                                  ? 'legal'
                                  : sessionStyle === 'psychology'
                                    ? 'psychology'
                                    : 'consult';
                        
                        let content = consultPanelInviteChatContent(expertName, style);
                        let kind: string = 'panel_open';

                        if (isPaymentRequest) {
                            content = `💳 **${expertName}** bilan sessiyani boshlash uchun xizmat haqqini to'lashingiz lozim. To'lovdan so'ng sessiyaga ulanish tugmasi faollashadi.`;
                            kind = 'payment_request';
                        }

                        let serviceAmountMali: number | null = null;
                        if (style !== 'mentor') {
                            const sr = await pool.query(
                                `SELECT amount_mali, status::text AS status FROM service_sessions
                                 WHERE chat_id = $1 AND expert_id = $2::uuid
                                 ORDER BY id DESC LIMIT 1`,
                                [chatId, userId]
                            );
                            if (sr.rows.length > 0) {
                                const amt = parseFloat(String(sr.rows[0].amount_mali ?? '0'));
                                const st = String(sr.rows[0].status || '');
                                if (Number.isFinite(amt) && amt > 0) {
                                    const amtStr = amt.toLocaleString('uz-UZ', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 4,
                                    });
                                    if (st === 'initiated') {
                                        content += `\n\n💰 **${amtStr} MALI** xizmat uchun hisobingizdan kafillik (escrow) qilib olingan. Ulanish orqali xizmatdan foydalanishni davom ettirasiz.`;
                                        serviceAmountMali = amt;
                                    } else if (st === 'ongoing') {
                                        content += `\n\n💰 Faol xizmat: **${amtStr} MALI** (kafillikda).`;
                                        serviceAmountMali = amt;
                                    }
                                }
                            }
                        }

                        const meta = {
                            sessionId: chatId,
                            sessionStyle: style,
                            kind,
                            ...(serviceAmountMali != null ? { serviceAmountMali } : {}),
                        };
                        const mentor = await UserModel.findById(userId);
                        const mentorAvatar = mentor?.avatar_url || authSocket.user?.avatar_url || null;

                        const newMessage = await MessageModel.create(
                            chatId,
                            userId,
                            content,
                            'consult_panel_invite',
                            meta
                        );

                        this.io.to(chatId).emit('receive_message', {
                            id: newMessage.id,
                            chat_id: chatId,
                            roomId: chatId,
                            sender_id: userId,
                            sender_name: expertName,
                            sender_avatar: mentorAvatar,
                            content,
                            type: 'consult_panel_invite',
                            metadata: meta,
                            created_at: new Date().toISOString(),
                        });
                    } catch (e) {
                        console.error('[Socket] consult_panel_invite error:', e);
                    }
                }
            );

            /** HTTP `/api/service/start-ongoing` yo‘q (eski deploy) bo‘lsa — soket orqali zaxira */
            authSocket.on('consult_start_ongoing', async (data: { chatId?: string }) => {
                try {
                    const expertId = authSocket.user?.id;
                    const chatId = data?.chatId;
                    if (!expertId || !chatId) {
                        authSocket.emit('consult_start_ongoing_result', {
                            ok: false,
                            message: 'chatId kerak',
                        });
                        return;
                    }
                    const { markConsultSessionOngoingByExpert } = await import(
                        '../services/consultSession.service'
                    );
                    const row = await markConsultSessionOngoingByExpert(
                        String(expertId),
                        String(chatId),
                        this.io
                    );
                    authSocket.emit('consult_start_ongoing_result', { ok: true, session: row });
                } catch (e: any) {
                    authSocket.emit('consult_start_ongoing_result', {
                        ok: false,
                        message: e?.message || 'Xatolik',
                        statusCode: e?.statusCode,
                    });
                }
            });

            // Darsni yakunlash — guruh chatiga xabar + sessiyadagi barcha talabalarga lesson_ended
            authSocket.on(
                'lesson_end',
                async (data: {
                    sessionId: string;
                    mentorName: string;
                    sessionStyle?: 'mentor' | 'consult';
                }) => {
                try {
                    const { sessionId, mentorName, sessionStyle } = data;
                    const userId = authSocket.user.id;
                    console.log(`[Socket] lesson_end: sessionId=${sessionId}, mentorName=${mentorName}, type=${sessionStyle}`);

                    const { MessageModel } = await import('../models/postgres/Message');
                    const { pool } = await import('../config/database');
                    const { completeConsultation } = await import('../services/consultSession.service');

                    let chatId: string | null = null;
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    if (uuidRegex.test(sessionId)) {
                        const checkDirect = await pool.query(
                            'SELECT chat_id FROM chat_participants WHERE chat_id = $1 AND user_id = $2',
                            [sessionId, userId]
                        );
                        if ((checkDirect.rowCount ?? 0) > 0) {
                            chatId = sessionId;
                        }
                    }
                    if (!chatId) {
                        const checkByName = await pool.query(
                            `
                            SELECT c.id FROM chats c
                            JOIN chat_participants cp ON c.id = cp.chat_id
                            WHERE c.type = 'group' AND cp.user_id = $1 AND c.name = $2
                            LIMIT 1
                        `,
                            [userId, sessionId]
                        );
                        if ((checkByName.rowCount ?? 0) > 0) {
                            chatId = checkByName.rows[0].id;
                        }
                    }

                    // Release escrow for consulting sessions
                    if (sessionStyle === 'consult') {
                        try {
                            await completeConsultation(userId, sessionId, this.io);
                            console.log(`[Socket] Escrow released for consult session: ${sessionId}`);
                        } catch (e) {
                            console.error(`[Socket] completeConsultation failed for ${sessionId}:`, e);
                        }
                    }

                    const content = lessonNotifyChatContent(mentorName, 'end', sessionStyle);
                    if (chatId) {
                        const mentor = await UserModel.findById(userId);
                        const mentorAvatar = mentor?.avatar_url || authSocket.user?.avatar_url || null;

                        const newMessage = await MessageModel.create(
                            chatId,
                            userId,
                            content,
                            'lesson_end',
                            { sessionId }
                        );

                        this.io.to(chatId).emit('receive_message', {
                            id: newMessage.id,
                            chat_id: chatId,
                            roomId: chatId,
                            sender_id: userId,
                            sender_name: mentorName,
                            sender_avatar: mentorAvatar,
                            content,
                            type: 'lesson_end',
                            metadata: { sessionId },
                            created_at: new Date().toISOString()
                        });
                    }

                    this.io.to(sessionId).emit('lesson_ended', {
                        sessionId,
                        mentorName,
                        message: content
                    });
                } catch (error) {
                    console.error('[Socket] lesson_end error:', error);
                }
            });

            // Material Sharing in Sessions
            authSocket.on('material_uploaded', (data: { sessionId: string, material: any }) => {
                // Broadcast to everyone in the room except the uploader, or to everyone including the uploader
                // (Depends on frontend logic, we emit to the entire room)
                console.log(`[Socket] Material uploaded in session ${data.sessionId}: ${data.material?.title}`);
                this.io.to(data.sessionId).emit('material_new', data.material);
            });

            /** Doska: bitta handler; `socket.to(room)` — yuboruvchidan boshqa xonadagilarga (chiziq takrorlanmasin). sessionId trim. */
            authSocket.on('whiteboard:draw', (data: { sessionId?: string } & Record<string, unknown>) => {
                const sid = data?.sessionId != null ? String(data.sessionId).trim() : '';
                if (!sid) return;
                authSocket.to(sid).emit('whiteboard:draw', data);
            });

            authSocket.on('whiteboard:clear', (data: { sessionId?: string }) => {
                const sid = data?.sessionId != null ? String(data.sessionId).trim() : '';
                if (!sid) return;
                authSocket.to(sid).emit('whiteboard:clear', data);
            });

            authSocket.on('whiteboard:toggle', (data: { sessionId: string, isOpen: boolean }) => {
                // Broadcast to ALL participants in the session including the mentor
                this.io.to(data.sessionId).emit('whiteboard:toggle', {
                    sessionId: data.sessionId,
                    isOpen: data.isOpen
                });
                console.log(`[Socket] Whiteboard toggle in session ${data.sessionId}: ${data.isOpen}`);
            });

            // Live Quiz System
            authSocket.on('quiz_start', (data: { sessionId: string, quizId: string, quizDetails: any }) => {
                console.log(`[Socket] Quiz Started in session ${data.sessionId}: ${data.quizId}`);
                this.io.to(data.sessionId).emit('quiz_active', {
                    sessionId: data.sessionId,
                    quizId: data.quizId,
                    quizDetails: data.quizDetails,
                });
            });

            /** Ustoz mikrofon/kamera holati — talaba panelidagi badge uchun */
            authSocket.on(
                'media_state_change',
                (data: { sessionId?: string; type?: string; enabled?: boolean }) => {
                    const sessionId = data?.sessionId != null ? String(data.sessionId) : '';
                    if (!sessionId) return;
                    const t = data?.type === 'video' ? 'video' : 'audio';
                    this.io.to(sessionId).emit('mentor_media_state', {
                        sessionId,
                        mentorId: authSocket.user.id,
                        type: t,
                        enabled: Boolean(data?.enabled),
                    });
                }
            );

            authSocket.on('quiz_answer', (data: { sessionId: string, quizId: string, answerDetails?: any }) => {
                this.io.to(data.sessionId).emit('quiz_result_update', {
                    studentId: authSocket.user.id,
                    ...data
                });
            });

            authSocket.on('quiz_submit', (data: { sessionId: string, quizId: string, studentId?: string, answers?: any, score?: number }) => {
                this.io.to(data.sessionId).emit('quiz_result_update', {
                    studentId: data.studentId || authSocket.user.id,
                    quizId: data.quizId,
                    score: data.score ?? 0
                });
            });

            // Talaba "Savolim bor" / qo'l ko'tarish — mentor panelda ko'rinadi
            authSocket.on('student_raise_hand', (data: { sessionId: string }) => {
                const sessionId = data?.sessionId;
                if (!sessionId) return;
                this.io.to(sessionId).emit('hand_raised', {
                    studentId: authSocket.user.id,
                    studentName: authSocket.user.name || authSocket.user.phone || 'Talaba'
                });
            });
            authSocket.on('student_lower_hand', (data: { sessionId: string }) => {
                const sessionId = data?.sessionId;
                if (!sessionId) return;
                this.io.to(sessionId).emit('hand_lowered', { studentId: authSocket.user.id });
            });

            authSocket.on(
                'force_mute_student',
                async (data: { sessionId: string; studentId: string }) => {
                    const { sessionId, studentId } = data || ({} as any);
                    if (!sessionId || !studentId) return;
                    const ok = await verifyUserCanControlSession(sessionId, authSocket.user.id);
                    if (!ok) return;
                    this.io.to(String(studentId)).emit('mentor_media_command', {
                        sessionId: String(sessionId),
                        kind: 'mic',
                        enabled: false,
                    });
                }
            );

            authSocket.on(
                'mentor_request_student_unmute',
                async (data: { sessionId: string; studentId: string }) => {
                    const { sessionId, studentId } = data || ({} as any);
                    if (!sessionId || !studentId) return;
                    const ok = await verifyUserCanControlSession(sessionId, authSocket.user.id);
                    if (!ok) return;
                    this.io.to(String(studentId)).emit('mentor_media_command', {
                        sessionId: String(sessionId),
                        kind: 'mic',
                        enabled: true,
                    });
                }
            );

            authSocket.on(
                'mentor_dismiss_hand',
                async (data: { sessionId: string; studentId: string }) => {
                    const { sessionId, studentId } = data || ({} as any);
                    if (!sessionId || !studentId) return;
                    const ok = await verifyUserCanControlSession(sessionId, authSocket.user.id);
                    if (!ok) return;
                    this.io.to(sessionId).emit('hand_lowered', { studentId: String(studentId) });
                }
            );

            authSocket.on('update_profile', async (data: { name?: string, username?: string, bio?: string }) => {
                try {
                    const userId = authSocket.user.id;
                    // Update user in Postgres and Get Result
                    const updatedUser = await UserModel.update(userId, data);

                    if (updatedUser) {
                        console.log(`Updating profile for user ${userId}:`, data);

                        // Map snake_case to camelCase if needed, or send as is.
                        // Frontend expects 'avatar', but DB has 'avatar_url'. 
                        // Let's ensure we send a compatible object.
                        const payload = {
                            ...updatedUser,
                            avatar: updatedUser.avatar_url, // Map back for frontend compatibility
                            // ensure other fields match if necessary
                        };

                        // Broadcast to ALL of user's sockets (Sidebar + ProfileViewer + Other Tabs)
                        this.io.to(userId).emit('profile_updated', payload);
                    }
                } catch (error) {
                    console.error('Update profile error:', error);
                    authSocket.emit('error', { message: 'Failed to update profile' });
                }
            });

            // Breakout Rooms System
            authSocket.on('breakout:start', async (data: { sessionId: string, numGroups: number }) => {
                try {
                    const { sessionId, numGroups } = data;

                    // Get all sockets currently in the main room
                    const sockets = await this.io.in(sessionId).fetchSockets();

                    // Filter out the mentor/initiator to keep them in main room or allow them to float
                    const localSockets = sockets.map(s => this.io.sockets.sockets.get(s.id)).filter(s => s !== undefined) as AuthenticatedSocket[];
                    const studentSockets = localSockets.filter(s => s.user?.id !== authSocket.user.id);

                    // Shuffle students
                    for (let i = studentSockets.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [studentSockets[i], studentSockets[j]] = [studentSockets[j], studentSockets[i]];
                    }

                    const assignments: Record<string, string[]> = {};
                    for (let i = 1; i <= numGroups; i++) {
                        assignments[`${sessionId}-group-${i}`] = [];
                    }

                    // Distribute
                    studentSockets.forEach((s, index) => {
                        const groupIndex = index % numGroups + 1;
                        const subRoomId = `${sessionId}-group-${groupIndex}`;
                        assignments[subRoomId].push(s.user.id);

                        // Notify student
                        s.emit('breakout:assigned', { subRoomId, mainRoomId: sessionId });
                    });

                    // Notify mentor of the breakdown mapping
                    authSocket.emit('breakout:rooms_created', { assignments });

                    // Also notify the entire main room that breakouts have started (UI updates)
                    this.io.to(sessionId).emit('breakout:active', { numGroups });

                } catch (error) {
                    console.error('Breakout start error:', error);
                    authSocket.emit('error', { message: 'Failed to start breakout rooms' });
                }
            });

            authSocket.on('breakout:end', (data: { sessionId: string }) => {
                // Broadcast to the main room (which everyone should ostensibly still be a part of or at least listening to)
                // Actually, if they left the socket room, they might not hear it. 
                // But in LiveKit logic, they stay connected to the main Chat Socket room, just change LiveKit Room.
                // We emit to the main session socket room.
                this.io.to(data.sessionId).emit('breakout:ended', { mainRoomId: data.sessionId });
            });

            // Wallet Real-time Balance Fetch
            authSocket.on('get_balance', async () => {
                try {
                    const userId = authSocket.user.id;
                    const balance = await TokenService.getBalance(userId);
                    authSocket.emit('balance_updated', balance); // { balance: number, locked_balance: number }
                } catch (error) {
                    console.error('Get balance error:', error);
                    authSocket.emit('error', { message: 'Failed to fetch balance' });
                }
            });

            authSocket.on('disconnect', () => {
                const userId = authSocket.user?.id;
                console.log(`User disconnected: ${userId}`);

                if (userId) {
                    removeUserFromOnline(userId).then((remainingSockets) => {
                        if (remainingSockets <= 0) {
                            // Truly offline: Broadcast change
                            this.io.emit('user_status_change', { 
                                userId, 
                                status: 'offline', 
                                lastSeen: new Date() 
                            });
                        }
                    });
                }
            });

            // Kick Student from Session
            authSocket.on('kick_student', async (data: { sessionId: string, studentId: string }) => {
                const { sessionId, studentId } = data;
                if (!sessionId || !studentId) return;
                const canControl = await verifyUserCanControlSession(String(sessionId), String(authSocket.user.id));
                if (!canControl) {
                    authSocket.emit('error', { message: 'Bu amal uchun ruxsat yo‘q' });
                    return;
                }
                console.log(`[Socket] Mentor ${authSocket.user.id} kicking student ${studentId} from session ${sessionId}`);

                // 1. Emit to the specific student so their UI can react
                this.io.to(studentId).emit('student_kicked', { sessionId });

                // 2. Notify everyone in the session room
                this.io.to(sessionId).emit('participant_left', studentId);
            });
        });
    }

    private async handleBotCommand(socket: AuthenticatedSocket, roomId: string, commandText: string) {
        const args = commandText.split(' ');
        const command = args[0].toLowerCase();
        const userId = socket.user.id;

        let responseContent = '';

        try {
            if (command === '/balance') {
                const balance = await TokenService.getBalance(userId);
                // Assuming TokenBalance interface aligns with response
                responseContent = `Your balance:\nAvailable: ${balance.balance} MALI\nLocked: ${balance.locked_balance} MALI`;
            } else if (command === '/transfer') {
                // Usage: /transfer <receiverId> <amount>
                if (args.length < 3) {
                    responseContent = 'Usage: /transfer <receiverId> <amount>';
                } else {
                    const receiverId = args[1];
                    const amount = parseFloat(args[2]);
                    if (isNaN(amount)) {
                        responseContent = 'Invalid amount. Usage: /transfer <receiverId> <amount>';
                    } else {
                        // Assuming Service method returns transaction details
                        await TokenService.transferTokens({
                            senderId: userId,
                            receiverId: receiverId,
                            amount: amount,
                            note: 'Via Bot'
                        });
                        responseContent = `Successfully transferred ${amount} MALI to ${receiverId}.`;
                    }
                }
            } else if (command === '/book') {
                const services = await ServiceModel.findAll(5);
                const serviceList = services.map(s => `- ${s.title} (${s.price_mali} MALI) ID: ${s.id}`).join('\n');
                responseContent = `Top Services:\n${serviceList}\nTo book, use the UI or call support.`;
            } else if (command === '/faq') {
                responseContent = `**MALI Platform FAQ**\n1. What is MALI? - A utility token.\n2. Fees? - 0.1% for transfers.`;
            } else {
                responseContent = `Unknown command. Try /balance, /transfer <id> <amount>, /book, or /faq.`;
            }
        } catch (error: any) {
            responseContent = `Error: ${error.message}`;
        }

        // Send Bot Response
        const botMessage = await MessageModel.create(
            roomId,
            '00000000-0000-0000-0000-000000000000', // System/Bot UUID
            responseContent,
            'system',
            { senderName: 'MALI Bot' }
        );

        const botCreatedIso = messageCreatedAtToIso(botMessage);
        this.io.to(roomId).emit('receive_message', {
            ...botMessage,
            roomId,
            created_at: botCreatedIso,
            sender_name: 'MALI Bot',
            sender_avatar: null,
        });
    }
}
