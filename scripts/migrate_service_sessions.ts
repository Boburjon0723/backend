import { pool } from '../src/config/database';

async function migrate() {
    console.log('Starting migration: Creating service_sessions table...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Create status enum if not exists
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_session_status') THEN
                    CREATE TYPE service_session_status AS ENUM ('initiated', 'ongoing', 'completed', 'cancelled', 'disputed');
                END IF;
            END $$;
        `);

        // Create service_sessions table
        await client.query(`
            CREATE TABLE IF NOT EXISTS service_sessions (
                id SERIAL PRIMARY KEY,
                expert_id UUID REFERENCES users(id) ON DELETE CASCADE,
                client_id UUID REFERENCES users(id) ON DELETE CASCADE,
                chat_id TEXT,
                amount_mali DECIMAL(15,8) NOT NULL,
                status service_session_status DEFAULT 'initiated',
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

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
