
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log('Adding last_read_at column to chat_participants...');
        await pool.query(`
            ALTER TABLE chat_participants 
            ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP DEFAULT NOW()
        `);
        console.log('Migration successful.');
        await pool.end();
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
