import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });
import { pool } from '../src/config/database';

async function migrate() {
    console.log('Starting migration: whiteboard_snapshots and notes enhancement...');

    try {
        // 1. Whiteboard Snapshots Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS whiteboard_snapshots (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                session_id VARCHAR(255) NOT NULL,
                snapshot_data TEXT NOT NULL, -- Base64 or URL
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Created whiteboard_snapshots table');

        // 2. Clearer specialist_notes table creation
        await pool.query(`
            CREATE TABLE IF NOT EXISTS specialist_notes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                specialist_id UUID REFERENCES users(id) ON DELETE CASCADE,
                client_id UUID REFERENCES users(id) ON DELETE CASCADE,
                booking_id UUID, 
                content TEXT NOT NULL,
                is_private BOOLEAN DEFAULT TRUE,
                shared_with_client BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Ensured specialist_notes table exists with all columns');

    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        process.exit();
    }
}

migrate();
