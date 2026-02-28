import { query } from '../../config/database';

export class LiveSessionModel {
    static async createSession(sessionId: string, mentorId: string, title: string) {
        const text = `
            INSERT INTO live_sessions (id, mentor_id, title, status)
            VALUES ($1, $2, $3, 'active')
            ON CONFLICT (id) DO NOTHING
            RETURNING *;
        `;
        const result = await query(text, [sessionId, mentorId, title]);
        return result.rows[0];
    }

    static async updateRecording(sessionId: string, recordingUrl: string) {
        const text = `
            UPDATE live_sessions
            SET recording_url = $1, status = 'recorded'
            WHERE id = $2
            RETURNING *;
        `;
        const result = await query(text, [recordingUrl, sessionId]);
        return result.rows[0];
    }

    static async getSession(sessionId: string) {
        const text = `SELECT * FROM live_sessions WHERE id = $1`;
        const result = await query(text, [sessionId]);
        return result.rows[0];
    }
}

export class ChatModel {
    static async saveMessage(sessionId: string, senderId: string, receiverId: string | null, textContent: string, fileUrl: string | null = null, type: string = 'text') {
        const text = `
            INSERT INTO chat_messages (session_id, sender_id, receiver_id, text, file_url, type)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;
        const result = await query(text, [sessionId, senderId, receiverId, textContent, fileUrl, type]);
        return result.rows[0];
    }

    static async getSessionMessages(sessionId: string, limit: number = 50, offset: number = 0) {
        const text = `
            SELECT c.*, u.name as sender_name, u.avatar_url as sender_avatar
            FROM chat_messages c
            JOIN users u ON c.sender_id = u.id
            WHERE c.session_id = $1 AND c.receiver_id IS NULL
            ORDER BY c.created_at ASC
            LIMIT $2 OFFSET $3;
        `;
        const result = await query(text, [sessionId, limit, offset]);
        return result.rows;
    }
}
