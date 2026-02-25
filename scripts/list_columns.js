const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function listColumns() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'user_profiles'
        `);
        console.log('Columns in user_profiles:', JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

listColumns();
