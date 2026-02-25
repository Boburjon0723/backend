import { pool } from '../../config/database';

export interface Chat {
    id: string;
    creator_id: string | null;
    type: 'private' | 'group' | 'channel';
    name: string | null;
    description: string | null;
    avatar_url: string | null;
    link: string | null;
    created_at: Date;
    updated_at: Date;
}

export const ChatModel = {
    async findById(id: string): Promise<Chat | null> {
        const result = await pool.query('SELECT * FROM chats WHERE id = $1', [id]);
        return result.rows[0] || null;
    },

    async findPrivateChat(user1: string, user2: string): Promise<Chat | null> {
        const query = `
            SELECT c.* FROM chats c
            JOIN chat_participants p1 ON c.id = p1.chat_id
            JOIN chat_participants p2 ON c.id = p2.chat_id
            WHERE c.type = 'private' AND p1.user_id = $1 AND p2.user_id = $2
        `;
        const result = await pool.query(query, [user1, user2]);
        return result.rows[0] || null;
    },

    async createPrivate(user1: string, user2: string): Promise<Chat> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const chatRes = await client.query(
                "INSERT INTO chats (type) VALUES ('private') RETURNING *"
            );
            const chat = chatRes.rows[0];
            await client.query(
                'INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2), ($1, $3)',
                [chat.id, user1, user2]
            );
            await client.query('COMMIT');
            return chat;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    },

    async createGroup(creatorId: string, name: string, participantIds: string[]): Promise<Chat> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const chatRes = await client.query(
                "INSERT INTO chats (creator_id, name, type) VALUES ($1, $2, 'group') RETURNING *",
                [creatorId, name]
            );
            const chat = chatRes.rows[0];

            const allParticipants = [...new Set([creatorId, ...participantIds])];
            for (const pId of allParticipants) {
                await client.query(
                    'INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2)',
                    [chat.id, pId]
                );
            }

            await client.query('COMMIT');
            return chat;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    },

    async findUserChats(userId: string): Promise<any[]> {
        const query = `
            SELECT c.*, 
            (SELECT json_agg(user_id) FROM chat_participants WHERE chat_id = c.id) as participants,
            m.content as "lastMessage",
            m.type as "lastMessageType",
            m.created_at as "lastMessageAt"
            FROM chats c
            JOIN chat_participants cp ON c.id = cp.chat_id
            LEFT JOIN LATERAL (
                SELECT content, type, created_at 
                FROM messages 
                WHERE chat_id = c.id 
                ORDER BY created_at DESC 
                LIMIT 1
            ) m ON true
            WHERE cp.user_id = $1
            ORDER BY COALESCE(m.created_at, c.updated_at) DESC
        `;
        const result = await pool.query(query, [userId]);
        return result.rows.map(row => {
            let snippet = row.lastMessage;
            if (row.lastMessageType === 'image') snippet = '📷 Rasm';
            else if (row.lastMessageType === 'voice') snippet = '🎤 Ovoosli xabar';
            else if (row.lastMessageType === 'file') snippet = '📁 Fayl';
            else if (row.lastMessageType === 'transaction') snippet = '💰 O\'tkazma';

            return {
                ...row,
                lastMessage: snippet
            };
        });
    }
};
