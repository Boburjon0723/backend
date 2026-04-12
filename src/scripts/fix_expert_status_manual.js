const { Pool } = require('pg');
require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        const userCount = await pool.query('SELECT count(*) FROM users');
        console.log('Total Users:', userCount.rows[0].count);

        const query = `
            SELECT user_id, is_expert, verified_status, profession 
            FROM user_profiles
        `;
        const res = await pool.query(query);
        console.log('Profiles Found:', res.rows.length);
        console.table(res.rows);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
