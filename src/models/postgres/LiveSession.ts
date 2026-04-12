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

    /** Guruh (chat) id bo‘yicha yozuvni yaratadi yoki statusni `recording` qiladi. */
    static async upsertRecordingStart(sessionId: string, mentorId: string, title: string | null) {
        const text = `
            INSERT INTO live_sessions (id, mentor_id, title, status)
            VALUES ($1, $2, COALESCE($3, 'Dars'), 'recording')
            ON CONFLICT (id) DO UPDATE SET
                status = 'recording'
            RETURNING *;
        `;
        const result = await query(text, [sessionId, mentorId, title]);
        return result.rows[0];
    }

    /** Yozuvni tugatish: URL saqlanadi; qator bo‘lmasa mentor_id bilan yaratiladi. */
    static async upsertRecordingFinish(
        sessionId: string,
        mentorId: string,
        recordingUrl: string,
        title: string | null
    ) {
        const text = `
            INSERT INTO live_sessions (id, mentor_id, title, status, recording_url)
            VALUES ($1, $2, COALESCE($3, 'Dars yozuvi'), 'recorded', $4)
            ON CONFLICT (id) DO UPDATE SET
                recording_url = EXCLUDED.recording_url,
                status = 'recorded',
                egress_id = NULL,
                recording_staging_key = NULL
            RETURNING *;
        `;
        const result = await query(text, [sessionId, mentorId, title, recordingUrl]);
        return result.rows[0];
    }

    static async updateEgressMeta(sessionId: string, egressId: string, stagingKey: string) {
        const text = `
            UPDATE live_sessions
            SET egress_id = $1, recording_staging_key = $2
            WHERE id = $3
            RETURNING *;
        `;
        const result = await query(text, [egressId, stagingKey, sessionId]);
        return result.rows[0];
    }

    static async clearEgressMeta(sessionId: string) {
        await query(
            `UPDATE live_sessions SET egress_id = NULL, recording_staging_key = NULL WHERE id = $1`,
            [sessionId]
        );
    }

    static async getSession(sessionId: string) {
        const text = `SELECT * FROM live_sessions WHERE id = $1`;
        const result = await query(text, [sessionId]);
        return result.rows[0];
    }

    static async getSessionPublic(sessionId: string) {
        const row = await this.getSession(sessionId);
        if (!row) {
            return { status: 'idle' as const, recording_url: null as string | null, title: null as string | null };
        }
        return {
            status: row.status as string,
            recording_url: row.recording_url || null,
            title: row.title || null,
        };
    }

    static async getMentorSessionHistory(mentorId: string) {
        const text = `
            SELECT * FROM live_sessions
            WHERE mentor_id = $1 AND (status = 'recorded' OR status = 'completed')
            ORDER BY created_at DESC
        `;
        const result = await query(text, [mentorId]);
        return result.rows;
    }
}

export class ChatModel {
    static async saveMessage(sessionId: string, senderId: string, receiverId: string | null, textContent: string, fileUrl: string | null = null, type: string = 'text') {
        const text = `
            WITH inserted AS (
                INSERT INTO chat_messages (session_id, sender_id, receiver_id, text, file_url, type)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
            )
            SELECT i.*, u.name as sender_name, u.avatar_url as sender_avatar
            FROM inserted i
            JOIN users u ON i.sender_id = u.id;
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
