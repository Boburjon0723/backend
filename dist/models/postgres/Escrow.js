"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EscrowModel = void 0;
const database_1 = require("../../config/database");
exports.EscrowModel = {
    async create(client, data) {
        const query = `
      INSERT INTO escrow (
        user_id, service_id, booking_id, amount, status, metadata
      )
      VALUES ($1, $2, $3, $4, 'held', $5)
      RETURNING *
    `;
        const values = [
            data.user_id,
            data.service_id,
            data.booking_id,
            data.amount,
            data.metadata
        ];
        // Use provided client for transaction context
        const db = client || database_1.pool;
        const result = await db.query(query, values);
        return result.rows[0];
    },
    async findById(client, id) {
        const query = 'SELECT * FROM escrow WHERE id = $1';
        const db = client || database_1.pool;
        const result = await db.query(query, [id]);
        return result.rows[0] || null;
    },
    async updateStatus(client, id, status) {
        const query = `
        UPDATE escrow 
        SET status = $1, 
            released_at = CASE WHEN $1 = 'released' THEN CURRENT_TIMESTAMP ELSE released_at END,
            refunded_at = CASE WHEN $1 = 'refunded' THEN CURRENT_TIMESTAMP ELSE refunded_at END
        WHERE id = $2
        RETURNING *
      `;
        const db = client || database_1.pool;
        const result = await db.query(query, [status, id]);
        return result.rows[0];
    }
};
