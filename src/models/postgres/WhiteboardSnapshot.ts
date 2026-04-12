import { pool } from '../../config/database';

export interface WhiteboardSnapshot {
    id: string;
    session_id: string;
    snapshot_data: string;
    created_at: Date;
}

export const WhiteboardSnapshotModel = {
    async create(data: { session_id: string, snapshot_data: string }): Promise<WhiteboardSnapshot> {
        const query = `
            INSERT INTO whiteboard_snapshots (session_id, snapshot_data)
            VALUES ($1, $2)
            RETURNING *
        `;
        const result = await pool.query(query, [data.session_id, data.snapshot_data]);
        return result.rows[0];
    },

    async findLatestBySession(sessionId: string): Promise<WhiteboardSnapshot | null> {
        const query = `
            SELECT * FROM whiteboard_snapshots 
            WHERE session_id = $1 
            ORDER BY created_at DESC 
            LIMIT 1
        `;
        const result = await pool.query(query, [sessionId]);
        return result.rows[0] || null;
    }
};
