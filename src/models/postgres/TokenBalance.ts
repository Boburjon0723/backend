import { pool } from '../../config/database';

export interface TokenBalance {
    user_id: string;
    balance: number;
    locked_balance: number;
    lifetime_earned: number;
    lifetime_spent: number;
    updated_at: Date;
}

export const TokenBalanceModel = {
    async findByUserId(userId: string): Promise<TokenBalance | null> {
        const query = 'SELECT * FROM token_balances WHERE user_id = $1';
        const result = await pool.query(query, [userId]);
        return result.rows[0];
    },

    async createOrUpdate(client: any, userId: string, amount: number, type: 'credit' | 'debit'): Promise<TokenBalance> {
        // This is a naive implementation; strictly speaking for transfers we check balances first.
        // This method might be used for initialization or adjustments.
        // For transactional safety, logic should mostly live in the Service using "FOR UPDATE" clauses.
        throw new Error("Use specialized methods with locking for balance updates");
    }
};
