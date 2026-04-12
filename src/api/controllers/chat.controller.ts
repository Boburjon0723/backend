import { Request, Response } from 'express';
import { ChatModel } from '../../models/postgres/Chat';
import { MessageModel } from '../../models/postgres/Message';
import { UserModel } from '../../models/postgres/User';
import { TokenService } from '../../services/token.service';
import { safeGetCache, safeSetCache, safeDelCache } from '../../config/redis';
import { pool } from '../../config/database';

function parseChatMetadata(raw: unknown): Record<string, any> {
    if (!raw) return {};
    if (typeof raw === 'object') return raw as Record<string, any>;
    try {
        return JSON.parse(String(raw));
    } catch {
        return {};
    }
}

/** Tasdiqlangan ekspertning e'londa ko'rsatiladigan maydonlari (serverdan, clientaga ishonmaymiz) */
export async function fetchExpertListingSnapshot(expertId: string): Promise<Record<string, unknown> | null> {
    const res = await pool.query(
        `
        SELECT u.id, u.name, u.surname, u.avatar_url,
               p.profession, p.specialization, p.specialization_details, p.experience_years,
               p.hourly_rate, p.pricing_model, p.currency, p.service_format, p.service_languages,
               p.bio_expert, p.specialty_desc, p.expert_proposal
        FROM users u
        LEFT JOIN user_profiles p ON u.id = p.user_id
        WHERE u.id = $1 AND p.is_expert = true AND p.verified_status = 'approved'
        `,
        [expertId]
    );
    const r = res.rows[0];
    if (!r) return null;
    return {
        name: r.name,
        surname: r.surname,
        avatar_url: r.avatar_url,
        profession: r.profession,
        specialization: r.specialization,
        specialization_details: r.specialization_details,
        experience_years: r.experience_years,
        hourly_rate: r.hourly_rate,
        pricing_model: r.pricing_model,
        currency: r.currency,
        service_format: r.service_format,
        service_languages: r.service_languages,
        bio_expert: r.bio_expert,
        specialty_desc: r.specialty_desc,
        expert_proposal: r.expert_proposal,
    };
}

/** Shaxsiy chat qatorini joriy foydalanuvchi uchun boyitish (e'lon maxfiyligi bilan) */
export async function enrichPrivateChatRow(chat: any, currentUserId: string): Promise<any> {
    if (chat.type !== 'private' || !chat.participants) {
        return { ...chat, otherUser: null };
    }
    const otherParticipantId = chat.participants.find((p: string) => String(p) !== String(currentUserId));
    if (!otherParticipantId) return { ...chat, otherUser: null };

    const meta = parseChatMetadata(chat.metadata);
    if (meta.source === 'expert_listing' && meta.expert_id && meta.snapshot) {
        const isExpertSide = String(meta.expert_id) === String(currentUserId);
        if (isExpertSide) {
            const user = await UserModel.findById(otherParticipantId);
            if (user) {
                return {
                    ...chat,
                    otherUser: {
                        id: user.id,
                        name: user.name,
                        surname: user.surname,
                        avatar: user.avatar_url,
                        avatar_url: user.avatar_url,
                        listing_privacy: true,
                    },
                };
            }
        } else {
            const snap = meta.snapshot;
            return {
                ...chat,
                otherUser: {
                    id: meta.expert_id,
                    listing_privacy: true,
                    ...snap,
                    avatar: snap.avatar_url,
                },
            };
        }
    }

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
                    phone: user.phone,
                },
            };
        }
    } catch (e) {
        console.error(`Error fetching user ${otherParticipantId}:`, e);
    }
    return { ...chat, otherUser: null };
}

export const createChat = async (req: Request, res: Response) => {
    try {
        const { participantId, type, name, participants, fromExpertListing } = req.body;
        const currentUserId = (req as any).user.id;

        console.log('[createChat] Request Body:', req.body);
        console.log('[createChat] Current User ID from token:', currentUserId);

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        if (type === 'group') {
            if (!name) return res.status(400).json({ message: 'Group name is required' });
            const avatar_url = req.body.avatar_url;
            const newGroup = await ChatModel.createGroup(currentUserId, name, participants || [], avatar_url);
            const groupId = newGroup?.id ? String(newGroup.id) : null;
            console.log('[createChat] Guruh yaratildi, id=', groupId, 'name=', name);
            await safeDelCache(`user_chats:${currentUserId}`);
            if (participants && Array.isArray(participants)) {
                for (const pId of participants) {
                    await safeDelCache(`user_chats:${pId}`);
                }
            }
            return res.status(201).json({ ...newGroup, id: groupId || newGroup.id });
        }

        if (type === 'channel') {
            if (!name) return res.status(400).json({ message: 'Kanal nomi kerak' });
            const { description, link } = req.body;
            const newChannel = await ChatModel.createChannel(currentUserId, name, description, link);
            await safeDelCache(`user_chats:${currentUserId}`);
            return res.status(201).json(newChannel);
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

        const listingMeta =
            fromExpertListing === true ? await fetchExpertListingSnapshot(participantId) : null;
        if (fromExpertListing === true && !listingMeta) {
            return res.status(400).json({
                message: "Mutaxassis e'loni topilmadi yoki hali tasdiqlanmagan",
            });
        }

        let chat = await ChatModel.findPrivateChat(currentUserId, participantId);
        if (!chat) {
            const meta =
                listingMeta ?
                    {
                        source: 'expert_listing',
                        expert_id: participantId,
                        snapshot: listingMeta,
                    }
                :   null;
            chat = await ChatModel.createPrivate(currentUserId, participantId, meta);
        } else if (listingMeta) {
            await pool.query(
                `UPDATE chats SET metadata = $1::jsonb, updated_at = NOW() WHERE id = $2`,
                [
                    JSON.stringify({
                        source: 'expert_listing',
                        expert_id: participantId,
                        snapshot: listingMeta,
                    }),
                    chat.id,
                ]
            );
            chat = (await ChatModel.findById(chat.id))!;
        }

        await safeDelCache(`user_chats:${currentUserId}`);
        if (type === 'private' && participantId) {
            await safeDelCache(`user_chats:${participantId}`);
        } else if (participants) {
            for (const p of participants) {
                await safeDelCache(`user_chats:${p}`);
            }
        }

        const partsRes = await pool.query('SELECT user_id FROM chat_participants WHERE chat_id = $1', [chat.id]);
        const row = { ...chat, participants: partsRes.rows.map((r: { user_id: string }) => r.user_id) };
        const enriched = await enrichPrivateChatRow(row, currentUserId);
        res.status(201).json(enriched);
    } catch (error: any) {
        console.error('Create Chat Error:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};
export const getUserChats = async (req: Request, res: Response) => {
    try {
        const currentUserId = (req as any).user.id;
        const cacheKey = `user_chats:${currentUserId}`;
        const skipCache = req.query.refresh === '1' || req.query.refresh === 'true';

        // Try getting from cache first (skip if refresh requested)
        if (!skipCache) {
            const cachedChats = await safeGetCache(cacheKey);
            if (cachedChats) {
                console.log(`[getUserChats] Cache HIT for user: ${currentUserId}`);
                return res.status(200).json(JSON.parse(cachedChats));
            }
        }

        console.log(`[getUserChats] Cache MISS or refresh. Fetching chats from DB for user: ${currentUserId}`);
        const chats = await ChatModel.findUserChats(currentUserId);

        const enriched = await Promise.all(chats.map((chat) => enrichPrivateChatRow(chat, currentUserId)));

        // Set cache for 5 minutes
        await safeSetCache(cacheKey, JSON.stringify(enriched), 300);

        res.status(200).json(enriched);
    } catch (error) {
        console.error('Get Chats Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * DB dan kelgan `created_at` ni JSON uchun: allaqachon ISO qator bo‘lsa o‘zgartirmaymiz;
 * `Date` bo‘lsa `toISOString()`. Mavjud qiymatni `new Date(value)` orqali qayta parse qilmaslik kerak —
 * ayrim qiymatlar (masalan, driverdan kelgan maxsus format / soniyada saqlangan vaqt) noto‘g‘ri
 * interpretatsiya qilinishi yoki bir xil `getTime()` ga tushishi mumkin.
 */
function createdAtFromDbForJson(value: unknown): string | null {
    if (!value) return null;

    if (typeof value === 'string') return value;

    if (value instanceof Date) return value.toISOString();

    return null;
}

export const getMessages = async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        // UUID validation
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(chatId as string)) {
            return res.status(200).json([]); // Return empty messages for old mongo IDs
        }
        const messages = await MessageModel.findByChatId(chatId as string);

        if (process.env.NODE_ENV !== 'production') {
            console.log('[CHAT_FIX][api]', messages.map((m) => m.created_at));
        }

        const payload = messages.map((msg) => {
            const created_at = createdAtFromDbForJson(msg.created_at);
            return { ...msg, created_at };
        });
        res.status(200).json(payload);
    } catch (error) {
        console.error('Get Messages Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/** Obuna tekshiruvi uchun: guruh (room) yaratuvchisi — ustoz. A'zolik tekshirilmaydi. */
export const getRoomSubscriptionInfo = async (req: Request, res: Response) => {
    try {
        const chatId = req.params.chatId as string;
        const chat = await ChatModel.findById(chatId);
        if (!chat) return res.status(404).json({ message: 'Chat topilmadi' });
        const creator = chat.creator_id ? await UserModel.findById(chat.creator_id) : null;
        res.status(200).json({
            chatId,
            creator_id: chat.creator_id,
            creator_name: creator?.name || null,
            name: chat.name
        });
    } catch (error) {
        console.error('getRoomSubscriptionInfo:', error);
        res.status(500).json({ message: 'Server error' });
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
        if (!chat) {
            console.warn('[getChatDetails] Chat topilmadi, id=', chatId);
            return res.status(404).json({ message: 'Chat not found' });
        }
        console.log('[getChatDetails] Chat topildi, id=', chatId, 'type=', chat.type);

        // Get participants
        const chatsWithParticipants = await ChatModel.findUserChats(currentUserId);
        const thisChat = chatsWithParticipants.find(c => String(c.id) === String(chatId));

        if (!thisChat) return res.status(403).json({ message: 'Not authorized' });

        const listMeta = parseChatMetadata((chat as any).metadata);
        const isListing = listMeta.source === 'expert_listing' && listMeta.expert_id && listMeta.snapshot;

        const participantsData = await Promise.all(
            thisChat.participants.map(async (pId: string) => {
                const user = await UserModel.findById(pId);
                if (!user) return null;
                if (isListing) {
                    if (String(pId) === String(listMeta.expert_id)) {
                        const s = listMeta.snapshot;
                        return {
                            id: user.id,
                            name: s.name,
                            surname: s.surname,
                            avatar: s.avatar_url,
                            listing_privacy: true,
                        };
                    }
                    return {
                        id: user.id,
                        name: user.name,
                        surname: user.surname,
                        avatar: user.avatar_url,
                        listing_privacy: true,
                    };
                }
                return {
                    id: user.id,
                    name: user.name,
                    surname: user.surname,
                    avatar: user.avatar_url,
                    phone: user.phone,
                };
            })
        );

        res.status(200).json({
            ...chat,
            participants: participantsData.filter(Boolean)
        });
    } catch (error) {
        console.error('Get Chat Details Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/** Obunasi bo'lgan talaba o'zini ustoz guruhiga qo'shadi */
export const joinGroupWithSubscription = async (req: Request, res: Response) => {
    try {
        const chatId = Array.isArray(req.params.chatId) ? req.params.chatId[0] : req.params.chatId;
        const currentUserId = (req as any).user.id;

        if (!chatId) return res.status(400).json({ message: 'chatId kerak' });

        const chat = await ChatModel.findById(chatId);
        if (!chat) return res.status(404).json({ message: 'Chat topilmadi' });
        if (chat.type !== 'group') return res.status(400).json({ message: 'Faqat guruhga qo\'shilish mumkin' });

        const mentorId = chat.creator_id;
        if (!mentorId) {
            await ChatModel.addParticipant(chatId, currentUserId);
            await safeDelCache(`user_chats:${currentUserId}`);
            const io = req.app.get('io');
            if (io) io.to(chatId).emit('participant_joined', { chatId, userId: currentUserId });
            return res.status(200).json({ message: 'Guruhga qo\'shildingiz', chat });
        }

        const active = await TokenService.getActiveSubscription(currentUserId, mentorId);
        if (!active) return res.status(403).json({ message: 'Obuna talab qilinadi. Avval ustozga obuna bo\'ling.' });

        await ChatModel.addParticipant(chatId, currentUserId);
        await safeDelCache(`user_chats:${currentUserId}`);

        const io = req.app.get('io');
        if (io) io.to(chatId).emit('participant_joined', { chatId, userId: currentUserId });

        res.status(200).json({ message: 'Guruhga qo\'shildingiz', chat });
    } catch (error: any) {
        console.error('joinGroupWithSubscription:', error);
        res.status(500).json({ message: 'Server xatosi', error: error?.message });
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

        if (
            chat.type === 'group' &&
            String(chat.creator_id || '') !== String(currentUserId)
        ) {
            return res.status(403).json({ message: 'Faqat guruh yaratuvchisi a\'zo taklif qilishi mumkin' });
        }

        const newUserId = String(userId);
        await ChatModel.addParticipant(chatId as string, newUserId);
        await safeDelCache(`user_chats:${newUserId}`);
        await safeDelCache(`user_chats:${String(currentUserId)}`);

        // Notify via Socket.IO that a new participant joined
        const io = req.app.get('io');
        if (io) {
            io.to(chatId).emit('participant_joined', { chatId, userId: newUserId });
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
        /** Faqat o'zi yaratgan dars guruhlari — boshqa ustozning guruhiga a'zo bo'lsa ham ro'yxatga tushmasin */
        const result = await pool.query(`
            SELECT c.id, c.name, p.expert_groups
            FROM chats c
            JOIN chat_participants cp ON c.id = cp.chat_id
            JOIN user_profiles p ON p.user_id = $1
            WHERE c.type = 'group'
              AND cp.user_id = $1
              AND c.creator_id = $1
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

        if (chat.type === 'group') {
            if (chat.creator_id !== currentUserId) {
                return res.status(403).json({ message: 'Faqat guruh yaratuvchisi guruhni o\'chira oladi' });
            }
        }

        await ChatModel.deleteChat(chatId as string);
        await safeDelCache(`user_chats:${currentUserId}`);
        res.status(200).json({ message: 'Chat deleted' });
    } catch (error) {
        console.error('Delete Chat Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const leaveGroup = async (req: Request, res: Response) => {
    try {
        const { chatId } = req.params;
        const currentUserId = (req as any).user.id;

        const chat = await ChatModel.findById(chatId as string);
        if (!chat) return res.status(404).json({ message: 'Chat not found' });

        if (chat.type !== 'group' && chat.type !== 'channel') {
            return res.status(400).json({ message: 'Faqat guruh yoki kanalda chiqish mumkin' });
        }

        const userChats = await ChatModel.findUserChats(currentUserId);
        if (!userChats.some(c => c.id === chatId)) {
            return res.status(403).json({ message: 'Siz ushbu guruh a\'zosi emassiz' });
        }

        await ChatModel.removeParticipant(chatId as string, currentUserId);
        await safeDelCache(`user_chats:${currentUserId}`);

        const io = req.app.get('io');
        if (io) {
            io.to(chatId).emit('participant_left', { chatId, userId: currentUserId });
        }

        res.status(200).json({ message: 'Guruhdan chiqdingiz' });
    } catch (error) {
        console.error('Leave Group Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateGroupChat = async (req: Request, res: Response) => {
    try {
        const rawId = req.params.chatId || (req.params as any).id;
        const chatId = typeof rawId === 'string' ? rawId.trim() : '';
        const currentUserId = (req as any).user.id;
        const { name, avatar_url } = req.body || {};

        if (!chatId) return res.status(400).json({ message: 'Chat ID kerak' });

        console.log('[updateGroupChat] chatId=', chatId, 'userId=', currentUserId);
        const chat = await ChatModel.findById(chatId);
        if (!chat) {
            console.warn('[updateGroupChat] Chat topilmadi, id:', chatId);
            await safeDelCache(`user_chats:${currentUserId}`);
            return res.status(404).json({ message: 'Chat topilmadi', chatId });
        }
        console.log('[updateGroupChat] Chat topildi, type=', chat.type);
        if (chat.type !== 'group') return res.status(400).json({ message: 'Faqat guruhni yangilash mumkin' });
        if (chat.creator_id !== currentUserId) {
            return res.status(403).json({ message: 'Faqat guruh yaratuvchisi nom va rasmni o\'zgartira oladi' });
        }

        const updates: { name?: string; avatar_url?: string } = {};
        if (typeof name === 'string' && name.trim()) updates.name = name.trim();
        if (typeof avatar_url === 'string') updates.avatar_url = avatar_url;

        const updated = await ChatModel.updateGroupChat(chatId as string, currentUserId, updates);
        if (!updated) return res.status(500).json({ message: 'Yangilash amalga oshmadi' });

        const userChats = await ChatModel.findUserChats(currentUserId);
        const thisChat = userChats.find(c => String(c.id) === String(chatId));
        if (thisChat?.participants) {
            for (const pId of thisChat.participants) {
                await safeDelCache(`user_chats:${pId}`);
            }
        }

        const io = req.app.get('io');
        if (io) {
            const payload = {
                chatId,
                name: updated.name ?? undefined,
                avatar_url: updated.avatar_url ?? undefined,
            };
            io.to(chatId).emit('chat_updated', payload);
            if (thisChat?.participants) {
                for (const pId of thisChat.participants) {
                    io.to(String(pId)).emit('chat_updated', payload);
                }
            }
        }

        res.status(200).json(updated);
    } catch (error) {
        console.error('Update Group Chat Error:', error);
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

