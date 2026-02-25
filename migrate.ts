import { pool } from './src/config/database';

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Starting migration...');

        await client.query('BEGIN');

        // Create user_blocks table
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_blocks (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                blocker_id UUID REFERENCES users(id) ON DELETE CASCADE,
                blocked_id UUID REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(blocker_id, blocked_id)
            );
        `);
        console.log('Created user_blocks table');

        await client.query('COMMIT');
        console.log('Migration completed successfully');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', e);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
