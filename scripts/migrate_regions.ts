import { pool } from '../src/config/database';

async function migrate() {
    console.log('Starting migration: Adding region fields to user_profiles...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query('ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS wiloyat TEXT, ADD COLUMN IF NOT EXISTS tuman TEXT;');

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
