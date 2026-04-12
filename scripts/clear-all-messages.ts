/**
 * Barcha chat xabarlarini bazadan o‘chirish (messages jadvali to‘liq).
 * Ishlatish: backend papkasida `npm run clear-messages`
 * Talab: `.env` ichida `DATABASE_URL` (yoki loyihadagi database config).
 */
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { pool } from '../src/config/database';

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE messages SET parent_id = NULL WHERE parent_id IS NOT NULL');
        const { rowCount } = await client.query('DELETE FROM messages');
        await client.query('COMMIT');
        console.log('[clear-all-messages] O‘chirilgan qatorlar:', rowCount);
        console.log('[clear-all-messages] Brauzerda localStorage: chat_cache_* ni ham tozalang (ixtiyoriy).');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error('[clear-all-messages] Xato:', err);
    process.exit(1);
});
