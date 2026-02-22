"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionModel = void 0;
const database_1 = require("../../config/database");
exports.TransactionModel = {
    async create(client, data) {
        const query = `
      INSERT INTO transactions (
        sender_id, receiver_id, amount, fee, net_amount, type, status, note, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
        const values = [
            data.sender_id,
            data.receiver_id,
            data.amount,
            data.fee,
            data.net_amount,
            data.type,
            data.status,
            data.note,
            data.metadata
        ];
        // Use the provided client (for transaction scope) or global pool
        const db = client || database_1.pool;
        const result = await db.query(query, values);
        return result.rows[0];
    },
    async findByUserId(userId, limit = 20, offset = 0) {
        const query = `
      SELECT * FROM transactions 
      WHERE sender_id = $1 OR receiver_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
        const result = await database_1.pool.query(query, [userId, limit, offset]);
        return result.rows;
    }
};
