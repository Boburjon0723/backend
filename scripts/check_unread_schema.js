
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
    try {
        console.log('Checking messages table columns...');
        const resMsg = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'messages'
        `);
        console.log('Messages columns:', resMsg.rows.map(r => r.column_name).join(', '));

        console.log('\nChecking chat_participants table columns...');
        const resPart = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'chat_participants'
        `);
        console.log('Chat Participants columns:', resPart.rows.map(r => r.column_name).join(', '));

        await pool.end();
    } catch (err) {
        console.error('Error checking schema:', err);
        process.exit(1);
    }
}

checkSchema();
