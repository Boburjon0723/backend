
import { pool } from '../config/database';

async function initTopUpDB() {
    const client = await pool.connect();
    try {
        console.log('Initializing TopUp DB...');

        await client.query(`
            CREATE TABLE IF NOT EXISTS topup_requests (
                id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
                user_id UUID REFERENCES users(id),
                amount DECIMAL(15, 2) NOT NULL,
                status VARCHAR(20) DEFAULT 'pending', 
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        console.log('TopUp DB Initialized.');
    } catch (error) {
        console.error('Init Error:', error);
    } finally {
        client.release();
        process.exit(0);
    }
}

initTopUpDB();
