import { Request, Response } from 'express';
import { ChatModel } from '../../models/mongo/Chat';
import { UserModel } from '../../models/postgres/User';

export const createChat = async (req: Request, res: Response) => {
    try {
        const { participantId, type, name, participants } = req.body;
        const currentUserId = (req as any).user.id;

        // --- Channel Logic ---
        if (type === 'channel') {
            if (!name) {
                return res.status(400).json({ message: 'Channel name is required' });
            }

            const { description, avatar, link, channelType } = req.body;

            // Check if link is unique if provided
            if (link) {
                const existingLink = await ChatModel.findOne({ link });
                if (existingLink) {
                    return res.status(400).json({ message: 'Channel link is already taken' });
                }
            }

            const newChannel = await ChatModel.create({
                participants: [currentUserId],
                creatorId: currentUserId,
                type: 'channel',
                name: name,
                description: description,
                avatar: avatar,
                link: link,
                channelType: channelType || 'public',
                lastMessage: 'Channel created',
                lastMessageAt: new Date()
            });

            return res.status(201).json(newChannel);
        }

        // --- Group Chat Logic ---
        if (type === 'group') {
            if (!name) {
                return res.status(400).json({ message: 'Group name is required' });
            }
            if (!participants || !Array.isArray(participants) || participants.length === 0) {
                return res.status(400).json({ message: 'At least one participant is required' });
            }

            const allParticipants = [...new Set([currentUserId, ...participants])];

            const newGroup = await ChatModel.create({
                participants: allParticipants,
                creatorId: currentUserId,
                type: 'group',
                name: name,
                lastMessage: 'Group created',
                lastMessageAt: new Date()
            });

            return res.status(201).json(newGroup);
        }

        // --- Private Chat Logic ---
        console.log(`CreateChat: User ${currentUserId} wants to chat with ${participantId}`);

        if (!participantId) {
            return res.status(400).json({ message: 'Participant ID is required' });
        }

        if (currentUserId === participantId) {
            return res.status(400).json({ message: 'Cannot chat with yourself' });
        }

        // Check if chat already exists
        const existingChat = await ChatModel.findOne({
            participants: { $all: [currentUserId, participantId], $size: 2 },
            type: 'private'
        });

        if (existingChat) {
            return res.status(200).json(existingChat);
        }

        // Create new chat
        const newChat = await ChatModel.create({
            participants: [currentUserId, participantId],
            type: 'private'
        });

        res.status(201).json(newChat);
    } catch (error: any) {
        console.error('Create Chat Error:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message, stack: error.stack });
    }
};

export const getUserChats = async (req: Request, res: Response) => {
    try {
        const currentUserId = (req as any).user.id;

        const chats = await ChatModel.find({
            participants: currentUserId
        }).sort({ updatedAt: -1 });

        // Enrich chat data with other participant's info
        const enrichedChats = await Promise.all(chats.map(async (chat) => {
            const chatObj = chat.toObject();
            const stringId = chat._id.toString();

            if (chat.type === 'group' || chat.type === 'channel') {
                return {
                    ...chatObj,
                    id: stringId,
                    _id: stringId,
                    name: chat.name || (chat.type === 'group' ? 'Unnamed Group' : 'Unnamed Channel'),
                    avatar: chat.avatar || null,
                    description: chat.description || null,
                    link: chat.link || null,
                    channelType: chat.channelType || 'public',
                    participantsCount: chat.participants.length
                };
            }

            const otherParticipantId = chat.participants.find(p => String(p) !== String(currentUserId));

            const baseResult = {
                ...chatObj,
                id: stringId,
                _id: stringId
            };

            if (!otherParticipantId) return baseResult;

            try {
                const user = await UserModel.findById(otherParticipantId);
                return {
                    ...baseResult,
                    otherUser: user ? {
                        id: user.id || (user as any)._id.toString(),
                        name: user.name,
                        surname: user.surname,
                        avatar: user.avatar_url,
                        phone: user.phone
                    } : null
                };
            } catch (err) {
                console.error(`Error fetching user ${otherParticipantId}:`, err);
                return baseResult;
            }
        }));

        res.status(200).json(enrichedChats);
    } catch (error) {
        console.error('Get Chats Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

import { MessageModel } from '../../models/mongo/Message';

export const getMessages = async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const currentUserId = (req as any).user.id;

        console.log(`[getMessages] Request for chat: ${chatId} by user: ${currentUserId}`);

        // Verify user is participant
        const chat = await ChatModel.findById(chatId);
        if (!chat) {
            console.log(`[getMessages] Chat not found: ${chatId}`);
            return res.status(404).json({ message: 'Chat not found' });
        }

        if (!chat.participants.some(p => String(p) === String(currentUserId))) {
            console.log(`[getMessages] Unauthorized access by ${currentUserId} to chat ${chatId}`);
            return res.status(403).json({ message: 'Not authorized' });
        }

        const messages = await MessageModel.find({ roomId: chatId })
            .sort({ createdAt: 1 }); // Oldest first

        console.log(`[getMessages] Found ${messages.length} messages for room ${chatId}`);

        res.status(200).json(messages);
    } catch (error) {
        console.error('Get Messages Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getChatDetails = async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const currentUserId = (req as any).user.id;

        const chat = await ChatModel.findById(chatId);
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        if (!chat.participants.some(p => String(p) === String(currentUserId))) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        // Fetch details for all participants
        const participantsData = await Promise.all(chat.participants.map(async (pId) => {
            const user = await UserModel.findById(pId as string);
            if (!user) return null;
            return {
                id: user.id,
                name: user.name,
                surname: user.surname,
                email: user.email,
                avatar: user.avatar_url,
                phone: user.phone
            };
        }));

        const chatObj = chat.toObject();
        res.status(200).json({
            ...chatObj,
            id: chatObj._id.toString(),
            _id: chatObj._id.toString(),
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

        if (!userId) {
            return res.status(400).json({ message: 'User ID is required' });
        }

        const chat = await ChatModel.findById(chatId);
        if (!chat) {
            return res.status(404).json({ message: 'Chat not found' });
        }

        if (chat.type !== 'group') {
            return res.status(400).json({ message: 'Cannot add participants to private chat' });
        }

        if (!chat.participants.some(p => String(p) === String(currentUserId))) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        if (chat.participants.includes(userId)) {
            return res.status(400).json({ message: 'User is already a participant' });
        }

        chat.participants.push(userId);
        await chat.save();

        // Fetch full details of the added user
        const newUser = await UserModel.findById(userId);

        res.status(200).json({
            message: 'Participant added',
            user: newUser ? {
                id: newUser.id,
                name: newUser.name,
                surname: newUser.surname,
                avatar: newUser.avatar_url,
                phone: newUser.phone
            } : null
        });
    } catch (error) {
        console.error('Add Participant Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getCommunities = async (req: Request, res: Response) => {
    try {
        const { category, region, district, q } = req.query;

        const filter: any = { isCommunity: true, isPrivate: false };

        if (category) filter.category = category;
        if (region) filter.region = region;
        if (district) filter.district = district;
        if (q) filter.name = { $regex: q, $options: 'i' };

        const communities = await ChatModel.find(filter).sort({ participantsCount: -1 }).limit(50);

        res.status(200).json(communities);
    } catch (error) {
        console.error('Get Communities Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const joinCommunity = async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const currentUserId = (req as any).user.id;

        const chat = await ChatModel.findById(chatId);
        if (!chat) return res.status(404).json({ message: 'Community not found' });
        if (!chat.isCommunity) return res.status(400).json({ message: 'Not a community' });

        if (chat.participants.includes(currentUserId)) {
            return res.status(200).json(chat);
        }

        chat.participants.push(currentUserId);
        // @ts-ignore
        chat.participantsCount = (chat.participantsCount || 0) + 1;
        await chat.save();

        res.status(200).json(chat);
    } catch (error) {
        console.error('Join Community Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
