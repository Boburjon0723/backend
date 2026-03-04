import { Pool } from 'pg';

const pool = new Pool({
    user: 'admin',
    host: 'localhost',
    database: 'mali_platform',
    password: 'admin',
    port: 5432,
});

async function main() {
    console.log('Running messages table migration...');
    try {
        await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;');
        console.log('Migration completed successfully: Added is_read column.');
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await pool.end();
    }
}

main();
