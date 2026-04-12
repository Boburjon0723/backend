const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env'), override: true });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function listUsers() {
    try {
        console.log('--- USER LIST FROM DATABASE ---');
        const res = await pool.query(`
            SELECT u.id, u.name, u.surname, u.phone, p.verified_status, p.profession
            FROM users u
            LEFT JOIN user_profiles p ON u.id = p.user_id
            ORDER BY u.created_at DESC
        `);
        console.table(res.rows);

        console.log('\n--- CONNECTION CONFIG ---');
        console.log('DATABASE_URL Host:', process.env.DATABASE_URL.split('@')[1]?.split(':')[0]);

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

listUsers();
