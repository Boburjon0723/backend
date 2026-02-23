import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { MessageModel } from '../models/postgres/Message';
import { TokenService } from '../services/token.service';
import { ServiceModel } from '../models/postgres/Service';
import { UserModel } from '../models/postgres/User';

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

            authSocket.on('send_message', async (data: { roomId: string, content: string, type?: string }) => {
                try {
                    const { roomId, content, type } = data;

                    // 1. Save to Postgres
                    const savedMessage = await MessageModel.create(
                        roomId,
                        authSocket.user.id,
                        content,
                        type || 'text',
                        { senderName: authSocket.user.name || authSocket.user.phone || "Unknown User" }
                    );
                    console.log(`[Socket] Saved message to Postgres DB:`, savedMessage.id, `Room: ${roomId}`);

                    // 2. Broadcast to room (including sender for confirmation)
                    this.io.to(roomId).emit('receive_message', savedMessage);
                    console.log(`[Socket] Broadcasted to room: ${roomId}`);

                    // 3. Bot Logic check
                    if (content.startsWith('/')) {
                        await this.handleBotCommand(authSocket, roomId, content);
                    }

                } catch (error) {
                    console.error('Send message error:', error);
                    authSocket.emit('error', { message: 'Failed to send message' });
                }
            });

            // Typing Indicators
            authSocket.on('typing', (roomId: string) => {
                authSocket.to(roomId).emit('typing', { senderId: authSocket.user.id, roomId });
            });

            authSocket.on('stop_typing', (roomId: string) => {
                authSocket.to(roomId).emit('stop_typing', { senderId: authSocket.user.id, roomId });
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
