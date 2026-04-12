import { pool } from '../../config/database';

export interface Session {
    id: string;
    service_id: string;
    provider_id: string;
    client_id: string;
    escrow_id: string;
    video_url: string;
    platform: 'jitsi' | 'agora';
    status: 'scheduled' | 'active' | 'completed' | 'cancelled'; // active = In Progress
    started_at?: Date;
    ended_at?: Date;
    duration_seconds?: number;
    metadata?: any;
    created_at: Date;
}

export const SessionModel = {
    async create(data: Partial<Session>): Promise<Session> {
        const query = `
      INSERT INTO sessions (
        service_id, provider_id, client_id, escrow_id, video_url, platform, status, started_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
        const values = [
            data.service_id,
            data.provider_id,
            data.client_id,
            data.escrow_id,
            data.video_url,
            data.platform || 'jitsi',
            data.status || 'scheduled',
            data.started_at
        ];
        const result = await pool.query(query, values);
        return result.rows[0];
    },

    async findById(id: string): Promise<Session | null> {
        const query = 'SELECT * FROM sessions WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    },

    async findByEscrowId(escrowId: string): Promise<Session | null> {
        const query = 'SELECT * FROM sessions WHERE escrow_id = $1';
        const result = await pool.query(query, [escrowId]);
        return result.rows[0] || null;
    },

    async updateStatus(id: string, status: string, endTime?: Date): Promise<Session> {
        let query = 'UPDATE sessions SET status = $1 WHERE id = $2 RETURNING *';
        let values = [status, id];

        if (status === 'completed' && endTime) {
            query = `
            UPDATE sessions 
            SET status = $1, ended_at = $3, 
                duration_seconds = EXTRACT(EPOCH FROM ($3 - started_at))
            WHERE id = $2 
            RETURNING *
          `;
            values = [status, id, endTime as any];
        }

        const result = await pool.query(query, values);
        return result.rows[0];
    }
};
