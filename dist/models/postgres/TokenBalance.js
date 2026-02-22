"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenBalanceModel = void 0;
const database_1 = require("../../config/database");
exports.TokenBalanceModel = {
    async findByUserId(userId) {
        const query = 'SELECT * FROM token_balances WHERE user_id = $1';
        const result = await database_1.pool.query(query, [userId]);
        return result.rows[0];
    },
    async createOrUpdate(client, userId, amount, type) {
        // This is a naive implementation; strictly speaking for transfers we check balances first.
        // This method might be used for initialization or adjustments.
        // For transactional safety, logic should mostly live in the Service using "FOR UPDATE" clauses.
        throw new Error("Use specialized methods with locking for balance updates");
    }
};
