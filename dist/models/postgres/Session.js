"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionModel = void 0;
const database_1 = require("../../config/database");
exports.SessionModel = {
    async create(data) {
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
        const result = await database_1.pool.query(query, values);
        return result.rows[0];
    },
    async findById(id) {
        const query = 'SELECT * FROM sessions WHERE id = $1';
        const result = await database_1.pool.query(query, [id]);
        return result.rows[0] || null;
    },
    async findByEscrowId(escrowId) {
        const query = 'SELECT * FROM sessions WHERE escrow_id = $1';
        const result = await database_1.pool.query(query, [escrowId]);
        return result.rows[0] || null;
    },
    async updateStatus(id, status, endTime) {
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
            values = [status, id, endTime];
        }
        const result = await database_1.pool.query(query, values);
        return result.rows[0];
    }
};
