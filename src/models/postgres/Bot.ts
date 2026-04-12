import { pool } from '../../config/database';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const TOKEN_PREFIX = 'mali_';
const TOKEN_BYTES = 24;
const SALT_ROUNDS = 10;

export interface Bot {
    id: string;
    user_id: string;
    name: string;
    username: string;
    token_prefix: string;
    token_hash: string;
    created_at: Date;
    updated_at: Date;
}

export const BotModel = {
    async create(userId: string, name: string, username: string): Promise<{ bot: Bot; token: string }> {
        const plainToken = TOKEN_PREFIX + crypto.randomBytes(TOKEN_BYTES).toString('hex');
        const tokenPrefix = plainToken.substring(0, 14);
        const tokenHash = await bcrypt.hash(plainToken, SALT_ROUNDS);

        const result = await pool.query(
            `INSERT INTO bots (user_id, name, username, token_prefix, token_hash)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, user_id, name, username, token_prefix, created_at, updated_at`,
            [userId, name.trim(), username.trim().toLowerCase(), tokenPrefix, tokenHash]
        );
        const bot = result.rows[0];
        return { bot, token: plainToken };
    },

    async listByUserId(userId: string): Promise<Omit<Bot, 'token_hash'>[]> {
        const result = await pool.query(
            `SELECT id, user_id, name, username, token_prefix, created_at, updated_at FROM bots WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
        );
        return result.rows;
    },

    async findById(id: string): Promise<Bot | null> {
        const result = await pool.query('SELECT * FROM bots WHERE id = $1', [id]);
        return result.rows[0] || null;
    },

    async findByUsername(username: string): Promise<Bot | null> {
        const result = await pool.query('SELECT * FROM bots WHERE username = $1', [username.trim().toLowerCase()]);
        return result.rows[0] || null;
    },

    async findByToken(plainToken: string): Promise<Bot | null> {
        if (!plainToken || !plainToken.startsWith(TOKEN_PREFIX)) return null;
        const prefix = plainToken.substring(0, 14);
        const result = await pool.query('SELECT * FROM bots WHERE token_prefix = $1', [prefix]);
        for (const row of result.rows) {
            const match = await bcrypt.compare(plainToken, row.token_hash);
            if (match) return row;
        }
        return null;
    },

    async regenerateToken(botId: string, userId: string): Promise<string | null> {
        const bot = await this.findById(botId);
        if (!bot || bot.user_id !== userId) return null;
        const plainToken = TOKEN_PREFIX + crypto.randomBytes(TOKEN_BYTES).toString('hex');
        const tokenPrefix = plainToken.substring(0, 14);
        const tokenHash = await bcrypt.hash(plainToken, SALT_ROUNDS);
        await pool.query(
            'UPDATE bots SET token_prefix = $1, token_hash = $2, updated_at = NOW() WHERE id = $3',
            [tokenPrefix, tokenHash, botId]
        );
        return plainToken;
    },

    async delete(botId: string, userId: string): Promise<boolean> {
        const result = await pool.query('DELETE FROM bots WHERE id = $1 AND user_id = $2', [botId, userId]);
        return (result.rowCount ?? 0) > 0;
    }
};
