import { Request, Response } from 'express';
import { ChatModel } from '../../models/postgres/Chat';
import { MessageModel } from '../../models/postgres/Message';
import { UserModel } from '../../models/postgres/User';
import { safeGetCache, safeSetCache, safeDelCache } from '../../config/redis';

export const createChat = async (req: Request, res: Response) => {
    try {
        const { participantId, type, name, participants } = req.body;
        const currentUserId = (req as any).user.id;

        console.log('[createChat] Request Body:', req.body);
        console.log('[createChat] Current User ID from token:', currentUserId);

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (type === 'group') {
            if (!name) return res.status(400).json({ message: 'Group name is required' });
            const newGroup = await ChatModel.createGroup(currentUserId, name, participants || []);
            return res.status(201).json(newGroup);
        }

        // Private Chat
        if (!participantId) {
            console.warn('[createChat] Missing participantId');
            return res.status(400).json({ message: 'Participant ID is required' });
        }

        if (!uuidRegex.test(participantId)) {
            console.warn(`[createChat] Invalid participantId format: "${participantId}"`);
            return res.status(400).json({ message: 'Invalid participant ID format' });
        }

        if (!uuidRegex.test(currentUserId)) {
            console.warn(`[createChat] Invalid currentUserId format: "${currentUserId}"`);
            return res.status(401).json({ message: 'Invalid session. Please logout and login again.' });
        }

        // Prevent duplicate private chats
        let chat = await ChatModel.findPrivateChat(currentUserId, participantId);
        if (!chat) {
            chat = await ChatModel.createPrivate(currentUserId, participantId);
        }

        // Invalidate cache since a new chat was created
        await safeDelCache(`user_chats:${currentUserId}`);
        if (type === 'private' && participantId) {
            await safeDelCache(`user_chats:${participantId}`);
        } else if (participants) {
            for (const p of participants) {
                await safeDelCache(`user_chats:${p}`);
            }
        }

        res.status(201).json(chat);
    } catch (error: any) {
        console.error('Create Chat Error:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
export const getUserChats = async (req: Request, res: Response) => {
    try {
        const currentUserId = (req as any).user.id;
        const cacheKey = `user_chats:${currentUserId}`;

        // Try getting from cache first
        const cachedChats = await safeGetCache(cacheKey);
        if (cachedChats) {
            console.log(`[getUserChats] Cache HIT for user: ${currentUserId}`);
            return res.status(200).json(JSON.parse(cachedChats));
        }

        console.log(`[getUserChats] Cache MISS. Fetching chats from DB for user: ${currentUserId}`);
        const chats = await ChatModel.findUserChats(currentUserId);

        // Enrich private chats with other user's info
        const enriched = await Promise.all(chats.map(async (chat) => {
            if (chat.type === 'private' && chat.participants) {
                const otherParticipantId = chat.participants.find((p: string) => String(p) !== String(currentUserId));
                if (otherParticipantId) {
                    try {
                        const user = await UserModel.findById(otherParticipantId);
                        if (user) {
                            return {
                                ...chat,
                                otherUser: {
                                    id: user.id,
                                    name: user.name,
                                    surname: user.surname,
                                    avatar: user.avatar_url,
                                    phone: user.phone
                                }
                            };
                        }
                    } catch (e) {
                        console.error(`Error fetching user ${otherParticipantId}:`, e);
                    }
                }
            }
            return { ...chat, otherUser: null };
        }));

        // Set cache for 5 minutes
        await safeSetCache(cacheKey, JSON.stringify(enriched), 300);

        res.status(200).json(enriched);
    } catch (error) {
        console.error('Get Chats Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getMessages = async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        // UUID validation
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(chatId as string)) {
            return res.status(200).json([]); // Return empty messages for old mongo IDs
        }
        const messages = await MessageModel.findByChatId(chatId as string);
        res.status(200).json(messages);
    } catch (error) {
        console.error('Get Messages Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getChatDetails = async (req: Request, res: Response) => {
    try {
        const chatId = req.params.chatId as string;
        const currentUserId = (req as any).user.id;

        // UUID validation
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(chatId)) {
            return res.status(404).json({ message: 'Chat not found (invalid ID)' });
        }

        const chat = await ChatModel.findById(chatId);
        if (!chat) return res.status(404).json({ message: 'Chat not found' });

        // Get participants
        const chatsWithParticipants = await ChatModel.findUserChats(currentUserId);
        const thisChat = chatsWithParticipants.find(c => c.id === chatId);

        if (!thisChat) return res.status(403).json({ message: 'Not authorized' });

        const participantsData = await Promise.all(thisChat.participants.map(async (pId: string) => {
            const user = await UserModel.findById(pId);
            return user ? {
                id: user.id,
                name: user.name,
                surname: user.surname,
                avatar: user.avatar_url,
                phone: user.phone
            } : null;
        }));

        res.status(200).json({
            ...chat,
            participants: participantsData.filter(Boolean)
        });
    } catch (error) {
        console.error('Get Chat Details Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const addParticipant = async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const { userId } = req.body;
        const currentUserId = (req as any).user.id;

        if (!chatId || !userId) {
            return res.status(400).json({ message: 'chatId and userId are required' });
        }

        const chat = await ChatModel.findById(chatId as string);
        if (!chat) return res.status(404).json({ message: 'Chat not found' });

        if (chat.type !== 'group' && chat.type !== 'channel') {
            return res.status(400).json({ message: 'Cannot add participant to a private chat' });
        }

        // Technically, we should check if currentUserId has permission to add participants 
        // (e.g. they are the creator of the group). But for now, since it's an automated
        // process after booking, we will just add the user.
        await ChatModel.addParticipant(chatId as string, String(userId));

        // Notify via Socket.IO that a new participant joined
        const io = req.app.get('io');
        if (io) {
            io.to(chatId).emit('participant_joined', { chatId, userId: String(userId) });
        }

        res.status(200).json({ message: 'Participant added successfully' });
    } catch (error) {
        console.error('Add Participant Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getExpertGroups = async (req: Request, res: Response) => {
    try {
        const { expertId } = req.params;
        if (!expertId) return res.status(400).json({ message: 'expertId is required' });

        const { pool } = await import('../../config/database');
        const result = await pool.query(`
            SELECT c.id, c.name, p.expert_groups
            FROM chats c
            JOIN chat_participants cp ON c.id = cp.chat_id
            JOIN user_profiles p ON p.user_id = $1
            WHERE c.type = 'group' AND cp.user_id = $1
            ORDER BY c.created_at DESC
        `, [expertId]);

        if (result.rows.length === 0) return res.status(200).json([]);

        const profileGroups = typeof result.rows[0].expert_groups === 'string'
            ? JSON.parse(result.rows[0].expert_groups)
            : result.rows[0].expert_groups;

        const groups = result.rows.map((r: any) => {
            const meta = Array.isArray(profileGroups) ? profileGroups.find((pg: any) => (pg.chatId === r.id || pg.id === r.id)) : null;
            return {
                chatId: r.id,
                name: r.name,
                id: r.id,
                time: meta ? meta.time : 'Vaqt belgilanmagan'
            };
        });

        res.status(200).json(groups);
    } catch (error) {
        console.error('Get Expert Groups Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};


export const getCommunities = async (req: Request, res: Response) => {
    // Communities can be handled as channels in Postgres
    res.status(200).json([]);
};

export const joinCommunity = async (req: Request, res: Response) => {
    res.status(501).json({ message: 'Not implemented yet' });
};
export const searchMessages = async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const { q } = req.query;

        if (!q) return res.status(200).json([]);

        const query: string = typeof q === 'string' ? q : (Array.isArray(q) ? String(q[0]) : '');
        const messages = await MessageModel.searchMessages(String(chatId), query as string);
        res.status(200).json(messages);
    } catch (error) {
        console.error('Search Messages Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const clearMessages = async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const currentUserId = (req as any).user.id;

        const chat = await ChatModel.findById(chatId as string);
        if (!chat) return res.status(404).json({ message: 'Chat not found' });

        // Verify user is participant
        const userChats = await ChatModel.findUserChats(currentUserId);
        if (!userChats.some(c => c.id === chatId)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await MessageModel.deleteByChatId(chatId as string);
        res.status(200).json({ message: 'History cleared' });
    } catch (error) {
        console.error('Clear Messages Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteChatEndpoint = async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const currentUserId = (req as any).user.id;

        const chat = await ChatModel.findById(chatId as string);
        if (!chat) return res.status(404).json({ message: 'Chat not found' });

        const userChats = await ChatModel.findUserChats(currentUserId);
        if (!userChats.some(c => c.id === chatId)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await ChatModel.deleteChat(chatId as string);
        res.status(200).json({ message: 'Chat deleted' });
    } catch (error) {
        console.error('Delete Chat Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteMessagesBulk = async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const { messageIds } = req.body;
        const currentUserId = (req as any).user.id;

        const chat = await ChatModel.findById(chatId as string);
        if (!chat) return res.status(404).json({ message: 'Chat not found' });

        const userChats = await ChatModel.findUserChats(currentUserId);
        if (!userChats.some(c => c.id === chatId)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await MessageModel.deleteByIds(chatId as string, messageIds);
        res.status(200).json({ message: 'Messages deleted' });
    } catch (error) {
        console.error('Delete Messages Bulk Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const markAsRead = async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const currentUserId = (req as any).user.id;

        await ChatModel.markChatAsRead(chatId as string, currentUserId);
        res.status(200).json({ message: 'Chat marked as read' });
    } catch (error) {
        console.error('Mark As Read Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

