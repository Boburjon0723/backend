import { pool } from '../../config/database';

export interface Message {
    id: string;
    chat_id: string;
    sender_id: string;
    content: string;
    type: string;
    metadata: any;
    parent_id?: string;
    created_at: Date;
    sender_name?: string;
    parentMessage?: any;
}

export const MessageModel = {
    async create(chatId: string, senderId: string, content: string, type: string = 'text', metadata: any = {}, parentId: string | null = null): Promise<Message> {
        const query = `
            INSERT INTO messages (chat_id, sender_id, content, type, metadata, parent_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;
        const result = await pool.query(query, [chatId, senderId, content, type, JSON.stringify(metadata), parentId]);

        // Update chat updatedAt timestamp
        await pool.query('UPDATE chats SET updated_at = NOW() WHERE id = $1', [chatId]);

        return result.rows[0];
    },

    async findByChatId(chatId: string): Promise<Message[]> {
        const query = `
            SELECT m.*, u.name as sender_name,
                   p.content as parent_content, p.type as parent_type, p.metadata as parent_metadata,
                   pu.name as parent_sender_name
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.id
            LEFT JOIN messages p ON m.parent_id = p.id
            LEFT JOIN users pu ON p.sender_id = pu.id
            WHERE m.chat_id = $1
            ORDER BY m.created_at ASC
        `;
        const result = await pool.query(query, [chatId]);

        return result.rows.map(row => ({
            ...row,
            parentMessage: row.parent_id ? {
                id: row.parent_id,
                text: row.parent_content,
                type: row.parent_type,
                metadata: row.parent_metadata,
                senderName: row.parent_sender_name
            } : null
        }));
    },

    async searchMessages(chatId: string, queryText: string): Promise<Message[]> {
        const query = `
            SELECT m.*, u.name as sender_name 
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.id
            WHERE m.chat_id = $1 AND m.content ILIKE $2
            ORDER BY m.created_at DESC
        `;
        const result = await pool.query(query, [chatId, `%${queryText}%`]);
        return result.rows;
    },

    async deleteByChatId(chatId: string): Promise<void> {
        const query = `DELETE FROM messages WHERE chat_id = $1`;
        await pool.query(query, [chatId]);
    },

    async deleteByIds(chatId: string, messageIds: string[]): Promise<void> {
        if (!messageIds || messageIds.length === 0) return;
        const query = `DELETE FROM messages WHERE chat_id = $1 AND id = ANY($2::uuid[])`;
        await pool.query(query, [chatId, messageIds]);
    }
};
