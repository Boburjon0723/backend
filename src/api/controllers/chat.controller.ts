import { Request, Response } from 'express';
import { ChatModel } from '../../models/postgres/Chat';
import { MessageModel } from '../../models/postgres/Message';
import { UserModel } from '../../models/postgres/User';

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

        res.status(201).json(chat);
    } catch (error: any) {
        console.error('Create Chat Error:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
export const getUserChats = async (req: Request, res: Response) => {
    try {
        const currentUserId = (req as any).user.id;
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
    const { chatId } = req.params;
    const { userId } = req.body;
    // ... logic placeholder
    res.status(501).json({ message: 'Not implemented yet for Postgres' });
};

export const getCommunities = async (req: Request, res: Response) => {
    // Communities can be handled as channels in Postgres
    res.status(200).json([]);
};

export const joinCommunity = async (req: Request, res: Response) => {
    res.status(501).json({ message: 'Not implemented yet' });
};
