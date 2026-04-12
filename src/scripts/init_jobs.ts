
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

const createJobsTable = async () => {
    try {
        console.log('Connecting to database...');
        const client = await pool.connect();

        console.log('Creating jobs table...');

        // Define ENUMs (if Postgres doesn't support them well via node-pg string, use text constraints)
        // We often use Text with Check constraint for simplicity

        const query = `
            CREATE TABLE IF NOT EXISTS jobs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                price VARCHAR(100),
                category VARCHAR(50) NOT NULL,
                type VARCHAR(20) CHECK (type IN ('online', 'offline')) NOT NULL,
                status VARCHAR(20) DEFAULT 'active',
                contact_phone VARCHAR(50),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
            CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
            CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
        `;

        await client.query(query);
        console.log('Jobs table created successfully!');

        client.release();
    } catch (err) {
        console.error('Error creating table:', err);
    } finally {
        await pool.end();
    }
};

createJobsTable();
