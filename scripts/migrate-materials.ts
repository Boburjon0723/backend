import { pool } from '../src/config/database';

async function migrate() {
    console.log('Starting dynamic materials migration...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log('1. Creating session_materials table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS session_materials (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
                uploader_id UUID REFERENCES users(id) ON DELETE SET NULL,
                title VARCHAR(255) NOT NULL,
                file_url TEXT NOT NULL,
                file_type VARCHAR(100),
                file_size_bytes BIGINT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Index for faster lookups by session
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_session_materials_session_id ON session_materials(session_id);
        `);

        await client.query('COMMIT');
        console.log('Migration successful!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrate();
