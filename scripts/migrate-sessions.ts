import { pool } from '../src/config/database';

async function migrateSessions() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        console.log('Creating live_sessions table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS live_sessions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                mentor_id UUID REFERENCES users(id),
                title VARCHAR(255) NOT NULL,
                recording_url TEXT,
                status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'recorded', 'ended')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ended_at TIMESTAMP
            );
        `);

        console.log('Creating chat_messages table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                session_id VARCHAR(255) NOT NULL,
                sender_id UUID REFERENCES users(id),
                receiver_id UUID REFERENCES users(id), -- For private messages if needed
                text TEXT,
                file_url TEXT,
                type VARCHAR(50) DEFAULT 'text' CHECK (type IN ('text', 'file', 'system')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('Adding indexes...');
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
            CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
        `);

        await client.query('COMMIT');
        console.log('Successfully completed Session schemas migration.');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error in Session schemas migration:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

migrateSessions()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
