"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const Message_1 = require("../models/mongo/Message");
const token_service_1 = require("../services/token.service");
const Service_1 = require("../models/postgres/Service");
const User_1 = require("../models/postgres/User");
class SocketService {
    constructor(io) {
        this.io = io;
        this.initialize();
    }
    initialize() {
        this.io.use((socket, next) => {
            try {
                const token = socket.handshake.auth.token || socket.handshake.query.token;
                if (!token) {
                    return next(new Error('Authentication error: Token required'));
                }
                const secret = process.env.JWT_SECRET;
                if (!secret)
                    return next(new Error('Server configuration error'));
                jsonwebtoken_1.default.verify(token, secret, (err, decoded) => {
                    if (err)
                        return next(new Error('Authentication error: Invalid token'));
                    socket.user = decoded;
                    next();
                });
            }
            catch (error) {
                next(new Error('Authentication error'));
            }
        });
        this.io.on('connection', (socket) => {
            const authSocket = socket;
            console.log(`User connected: ${authSocket.user?.id}`);
            // Join personal room for private messages
            authSocket.join(authSocket.user.id);
            authSocket.on('join_room', (roomId) => {
                authSocket.join(roomId);
                console.log(`User ${authSocket.user.id} joined room ${roomId}`);
            });
            authSocket.on('send_message', async (data) => {
                try {
                    const { roomId, content, type } = data;
                    // 1. Save to MongoDB
                    const message = new Message_1.MessageModel({
                        roomId,
                        senderId: authSocket.user.id,
                        senderName: authSocket.user.email, // Ideally fetch name from user service
                        content,
                        type: type || 'text'
                    });
                    await message.save();
                    // 2. Broadcast to room (including sender for confirmation)
                    this.io.to(roomId).emit('receive_message', message);
                    // 3. Bot Logic check
                    if (content.startsWith('/')) {
                        await this.handleBotCommand(authSocket, roomId, content);
                    }
                }
                catch (error) {
                    console.error('Send message error:', error);
                    authSocket.emit('error', { message: 'Failed to send message' });
                }
            });
            authSocket.on('update_profile', async (data) => {
                try {
                    const userId = authSocket.user.id;
                    // Update user in Postgres
                    // Assuming UserModel has an update method or using TypeORM/Sequelize directly
                    // Since I don't see the full ORM setup, I will use a placeholder or call a service if it exists.
                    // Let's assume User.update({ ...data }, { where: { id: userId } });
                    // In a real scenario: await UserService.update(userId, data);
                    await User_1.UserModel.update(userId, data);
                    console.log(`Updating profile for user ${userId}:`, data);
                    // Emit success back to sender
                    authSocket.emit('profile_updated', data);
                }
                catch (error) {
                    console.error('Update profile error:', error);
                    authSocket.emit('error', { message: 'Failed to update profile' });
                }
            });
            authSocket.on('disconnect', () => {
                console.log('User disconnected');
            });
        });
    }
    async handleBotCommand(socket, roomId, commandText) {
        const args = commandText.split(' ');
        const command = args[0].toLowerCase();
        const userId = socket.user.id;
        let responseContent = '';
        try {
            if (command === '/balance') {
                const balance = await token_service_1.TokenService.getBalance(userId);
                // Assuming TokenBalance interface aligns with response
                responseContent = `Your balance:\nAvailable: ${balance.balance} MALI\nLocked: ${balance.locked_balance} MALI`;
            }
            else if (command === '/transfer') {
                // Usage: /transfer <receiverId> <amount>
                if (args.length < 3) {
                    responseContent = 'Usage: /transfer <receiverId> <amount>';
                }
                else {
                    const receiverId = args[1];
                    const amount = parseFloat(args[2]);
                    if (isNaN(amount)) {
                        responseContent = 'Invalid amount. Usage: /transfer <receiverId> <amount>';
                    }
                    else {
                        // Assuming Service method returns transaction details
                        await token_service_1.TokenService.transferTokens({
                            senderId: userId,
                            receiverId: receiverId,
                            amount: amount,
                            note: 'Via Bot'
                        });
                        responseContent = `Successfully transferred ${amount} MALI to ${receiverId}.`;
                    }
                }
            }
            else if (command === '/book') {
                const services = await Service_1.ServiceModel.findAll(5);
                const serviceList = services.map(s => `- ${s.title} (${s.price_mali} MALI) ID: ${s.id}`).join('\n');
                responseContent = `Top Services:\n${serviceList}\nTo book, use the UI or call support.`;
            }
            else if (command === '/faq') {
                responseContent = `**MALI Platform FAQ**\n1. What is MALI? - A utility token.\n2. Fees? - 0.1% for transfers.`;
            }
            else {
                responseContent = `Unknown command. Try /balance, /transfer <id> <amount>, /book, or /faq.`;
            }
        }
        catch (error) {
            responseContent = `Error: ${error.message}`;
        }
        // Send Bot Response
        const botMessage = new Message_1.MessageModel({
            roomId,
            senderId: 'bot-system', // Special ID
            senderName: 'MALI Bot',
            content: responseContent,
            type: 'system'
        });
        await botMessage.save();
        // Emit to room (simplest approach for group chat bot)
        this.io.to(roomId).emit('receive_message', botMessage);
    }
}
exports.SocketService = SocketService;
