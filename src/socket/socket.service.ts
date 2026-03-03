import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { MessageModel } from '../models/postgres/Message';
import { TokenService } from '../services/token.service';
import { ServiceModel } from '../models/postgres/Service';
import { UserModel } from '../models/postgres/User';
import { pool } from '../config/database';
import { NotificationService } from '../services/notification.service';

// Ensure the AuthenticatedSocket interface matches actual usage
interface AuthenticatedSocket extends Socket {
    user?: any;
}

export class SocketService {
    private io: Server;
    // Map<userId, Set<socketId>> to handle multiple devices
    private onlineUsers: Map<string, Set<string>> = new Map();

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

            // Track Online Status
            if (userId) {
                if (!this.onlineUsers.has(userId)) {
                    this.onlineUsers.set(userId, new Set());
                }
                this.onlineUsers.get(userId)?.add(socket.id);

                // Broadcast 'user_online' to everyone (or just friends in future)
                this.io.emit('user_status_change', { userId, status: 'online' });
            }

            // Join personal room for private messages
            authSocket.join(authSocket.user.id);

            authSocket.on('join_room', (roomId: string) => {
                authSocket.join(roomId);
                console.log(`[Socket] User ${authSocket.user.id} joined room ${roomId}`);
            });

            authSocket.on('session_join', (data: { sessionId: string }) => {
                const { sessionId } = data;
                authSocket.join(sessionId);
                console.log(`[Socket] User ${authSocket.user.id} joined session ${sessionId}`);

                // Notify others in the room (Live Session Attendees)
                authSocket.to(sessionId).emit('participant_joined', {
                    id: authSocket.user.id,
                    name: authSocket.user.name || authSocket.user.phone || "User",
                    avatar: authSocket.user.avatar_url || authSocket.user.avatar || null
                });
            });

            authSocket.on('send_message', async (data: { roomId: string, content: string, type?: string, clientSideId?: string, caption?: string, size?: number, mimetype?: string, parentId?: string }) => {
                try {
                    const { roomId, content, type, clientSideId, caption, size, mimetype, parentId } = data;

                    // Mutual Block Guard for Private Chats
                    const chatRes = await pool.query(`SELECT type FROM chats WHERE id = $1`, [roomId]);
                    if (chatRes.rows[0]?.type === 'private') {
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
                            senderName: authSocket.user.name || authSocket.user.phone || "Unknown User",
                            caption: caption,
                            size: size,
                            mimetype: mimetype
                        },
                        parentId
                    );
                    console.log(`[Socket] Saved message to Postgres DB:`, savedMessage.id, `Room: ${roomId}`);

                    // 2. Broadcast to room (including sender for confirmation)
                    // Include roomId explicitly so frontend can match it, since savedMessage has chat_id (snake_case)
                    this.io.to(roomId).emit('receive_message', {
                        ...savedMessage,
                        roomId: roomId,  // Explicit roomId for frontend matching
                        clientSideId: clientSideId // ECHO BACK FOR DEDUPLICATION
                    });
                    console.log(`[Socket] Broadcasted to room: ${roomId} with clientSideId: ${clientSideId}`);

                    // 3. Bot Logic check
                    if (content.startsWith('/')) {
                        await this.handleBotCommand(authSocket, roomId, content);
                    }

                } catch (error) {
                    console.error('Send message error:', error);
                    authSocket.emit('error', { message: 'Failed to send message' });
                }
            });

            // Calling Signaling
            authSocket.on('call_user', (data: { targetUserId: string, signal: any, fromName: string, callType?: string }) => {
                this.io.to(data.targetUserId).emit('incoming_call', {
                    signal: data.signal,
                    from: authSocket.user.id,
                    fromName: data.fromName,
                    callType: data.callType
                });
            });

            authSocket.on('accept_call', (data: { to: string, signal: any }) => {
                this.io.to(data.to).emit('call_accepted', {
                    signal: data.signal,
                    from: authSocket.user.id
                });
            });

            authSocket.on('reject_call', (data: { to: string }) => {
                this.io.to(data.to).emit('call_rejected', { from: authSocket.user.id });
            });

            authSocket.on('end_call', (data: { to: string }) => {
                this.io.to(data.to).emit('call_ended', { from: authSocket.user.id });
            });

            authSocket.on('booking_accept', async (data: { studentId: string, url: string }) => {
                try {
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

            authSocket.on('call_signal', (data: { to: string, signal: any }) => {
                this.io.to(data.to).emit('call_signal', {
                    signal: data.signal,
                    from: authSocket.user.id
                });
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
            authSocket.on('lesson_start', async (data: { sessionId: string, mentorName: string }) => {
                try {
                    const { sessionId, mentorName } = data;
                    const userId = authSocket.user.id;
                    console.log(`[Socket] lesson_start received: sessionId=${sessionId}, mentorName=${mentorName}, userId=${userId}`);

                    const { MessageModel } = await import('../models/postgres/Message');
                    const { pool } = await import('../config/database');

                    // 1. IMPROVED LOOKUP: Find group chat where this mentor is a participant and the chat name or ID matches session
                    let chatId: string | null = null;
                    const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

                    // Option A: Check if sessionId is a valid chatId (ONLY if it's a valid UUID format)
                    if (isUuid(sessionId)) {
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

                    if (chatId) {
                        // Create a notification message in the persistent chat
                        const newMessage = await MessageModel.create(
                            chatId,
                            userId,
                            `🚀 Ustoz ${mentorName} darsni boshladi!`,
                            'lesson_start',
                            { sessionId: sessionId }
                        );
                        console.log(`[Socket] Created DB message:`, newMessage.id);

                        // Broadcast to the persistent chat room so students see the card
                        this.io.to(chatId).emit('message:receive', {
                            chat_id: chatId,
                            sender_id: userId,
                            sender_name: mentorName,
                            sender_avatar: authSocket.user.avatar_url,
                            text: `🚀 Ustoz ${mentorName} darsni boshladi!`,
                            type: 'lesson_start',
                            metadata: { sessionId: sessionId },
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

            // Material Sharing in Sessions
            authSocket.on('material_uploaded', (data: { sessionId: string, material: any }) => {
                // Broadcast to everyone in the room except the uploader, or to everyone including the uploader
                // (Depends on frontend logic, we emit to the entire room)
                console.log(`[Socket] Material uploaded in session ${data.sessionId}: ${data.material?.title}`);
                this.io.to(data.sessionId).emit('material_new', data.material);
            });

            // Interactive Whiteboard System
            authSocket.on('whiteboard:draw', (data: any) => {
                authSocket.to(data.sessionId).emit('whiteboard:draw', data);
            });

            authSocket.on('whiteboard:clear', (data: { sessionId: string }) => {
                authSocket.to(data.sessionId).emit('whiteboard:clear');
            });

            authSocket.on('whiteboard:toggle', (data: { sessionId: string, isOpen: boolean }) => {
                this.io.to(data.sessionId).emit('whiteboard:toggle', data.isOpen);
            });

            // Live Quiz System
            authSocket.on('quiz_start', (data: { sessionId: string, quizId: string, quizDetails: any }) => {
                console.log(`[Socket] Quiz Started in session ${data.sessionId}: ${data.quizId}`);
                // Broadcast the quiz to all attendees
                this.io.to(data.sessionId).emit('quiz_active', {
                    quizId: data.quizId,
                    quizDetails: data.quizDetails
                });
            });

            authSocket.on('quiz_answer', (data: { sessionId: string, quizId: string, answerDetails: any }) => {
                // Send answer back ONLY to the mentor/room creator or a specific tracking room
                // For simplicity, we broadcast to the room but handle filtering on frontend, OR
                // emit a specific `quiz_result_update` that the mentor listens to
                this.io.to(data.sessionId).emit('quiz_result_update', {
                    studentId: authSocket.user.id,
                    ...data
                });
            });

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

                if (userId && this.onlineUsers.has(userId)) {
                    const userSockets = this.onlineUsers.get(userId);
                    userSockets?.delete(socket.id);

                    if (userSockets?.size === 0) {
                        this.onlineUsers.delete(userId);
                        // Broadcast 'user_status_change'
                        this.io.emit('user_status_change', { userId, status: 'offline', lastSeen: new Date() });

                        // Also notify any rooms the user might have been in for Live Sessions
                        // For simplicity, we can't easily track which 'sessions' they were in without a more complex Map,
                        // but usually the frontend 'onUnmount' handles this. 
                        // However, we can use socket rooms to find where they were.
                    }
                }
            });

            // Kick Student from Session
            authSocket.on('kick_student', (data: { sessionId: string, studentId: string }) => {
                const { sessionId, studentId } = data;
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

        // Emit to room (simplest approach for group chat bot)
        this.io.to(roomId).emit('receive_message', botMessage);
    }
}
