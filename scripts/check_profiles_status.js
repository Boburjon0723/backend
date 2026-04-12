const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkProfiles() {
    try {
        const res = await pool.query(`
            SELECT u.id, u.name, u.surname, p.verified_status, p.is_expert, p.updated_at
            FROM users u
            JOIN user_profiles p ON u.id = p.user_id
            WHERE u.name ILIKE '%Boburjon%' OR p.verified_status = 'pending'
        `);
        console.log('Profiles found:', JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

checkProfiles();
