const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env'), override: true });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkPending() {
    try {
        console.log('Checking user_profiles for pending experts...');
        const res = await pool.query("SELECT user_id, verified_status, profession, specialization FROM user_profiles WHERE verified_status = 'pending'");
        console.log('Pending Experts found:', res.rows.length);
        if (res.rows.length > 0) {
            console.log('First 5 pending experts:', res.rows.slice(0, 5));
        }

        const allStatuses = await pool.query("SELECT verified_status, COUNT(*) FROM user_profiles GROUP BY verified_status");
        console.log('All status counts:', allStatuses.rows);

        const profilesWithProf = await pool.query("SELECT user_id, verified_status, profession FROM user_profiles WHERE profession IS NOT NULL LIMIT 5");
        console.log('Profiles with profession:', profilesWithProf.rows);

    } catch (err) {
        console.error('Database error:', err.message);
    } finally {
        await pool.end();
    }
}

checkPending();
