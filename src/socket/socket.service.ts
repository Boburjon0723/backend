import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { MessageModel } from '../models/postgres/Message';
import { TokenService } from '../services/token.service';
import { ServiceModel } from '../models/postgres/Service';
import { UserModel } from '../models/postgres/User';
import { pool } from '../config/database';

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
                console.log(`User ${authSocket.user.id} joined room ${roomId}`);
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
            authSocket.on('call_user', (data: { targetUserId: string, signal: any, fromName: string }) => {
                this.io.to(data.targetUserId).emit('incoming_call', {
                    signal: data.signal,
                    from: authSocket.user.id,
                    fromName: data.fromName
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

                    const savedMessage = await ChatModel.saveMessage(
                        sessionId,
                        authSocket.user.id,
                        receiverId || null,
                        content,
                        fileUrl || null,
                        type || 'text'
                    );

                    // Attach user info for frontend rendering
                    const broadcastMsg = {
                        ...savedMessage,
                        sender_name: authSocket.user.name || 'User',
                        sender_avatar: authSocket.user.avatar_url || null
                    };

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

            // Material Sharing in Sessions
            authSocket.on('material_uploaded', (data: { sessionId: string, material: any }) => {
                // Broadcast to everyone in the room except the uploader, or to everyone including the uploader
                // (Depends on frontend logic, we emit to the entire room)
                console.log(`[Socket] Material uploaded in session ${data.sessionId}: ${data.material?.title}`);
                this.io.to(data.sessionId).emit('material_new', data.material);
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
                        // Broadcast 'user_offline'
                        this.io.emit('user_status_change', { userId, status: 'offline', lastSeen: new Date() });
                    }
                }
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
