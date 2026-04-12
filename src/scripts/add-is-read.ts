/**
 * Bir martalik: messages.is_read ustuni (agar avtomatik migratsiya ishlamagan bo‘lsa).
 * Asosiy yo‘l: server ishga tushganda index.ts → runAutoMigration buni qiladi.
 *
 * Ishlatish: DATABASE_URL bilan `npx ts-node src/scripts/add-is-read.ts` (backend ildizidan)
 */
import { pool } from '../config/database';

async function main() {
    console.log('Running messages.is_read migration...');
    try {
        await pool.query(
            'ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;'
        );
        console.log('OK: messages.is_read column exists.');
    } catch (e) {
        console.error('Migration failed:', e);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

void main();
