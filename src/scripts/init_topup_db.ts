
import { query } from '../config/database';

async function initTopUpDB() {
    try {
        console.log('Initializing Top-Up Requests table...');

        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS topup_requests (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id),
                amount DECIMAL(20, 2) NOT NULL,
                status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await query(createTableQuery);

        console.log('Successfully created topup_requests table');
        process.exit(0);
    } catch (error) {
        console.error('Failed to initialize Top-Up DB:', error);
        process.exit(1);
    }
}

initTopUpDB();
