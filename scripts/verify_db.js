const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Mimic backend/src/config/database.ts logic
dotenv.config({ path: path.join(__dirname, '../.env'), override: true });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

console.log('DATABASE_URL starts with:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 20) : 'MISSING');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function verify() {
    try {
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user_profiles'
        `);
        const columns = res.rows.map(r => r.column_name);
        console.log('Columns found:', columns.join(', '));

        const required = ['resume_url', 'hourly_rate', 'diploma_url'];
        const missing = required.filter(c => !columns.includes(c));

        if (missing.length > 0) {
            console.log('CRITICAL MISSING COLUMNS:', missing);
        } else {
            console.log('All required columns exist.');
        }

        const pendingCount = await pool.query("SELECT COUNT(*) FROM user_profiles WHERE verified_status = 'pending'");
        console.log('Experts with verified_status = pending:', pendingCount.rows[0].count);

        const allStatus = await pool.query("SELECT DISTINCT verified_status FROM user_profiles");
        console.log('Existing statuses in user_profiles:', allStatus.rows.map(r => r.verified_status));

    } catch (err) {
        console.error('Database connection / query error:', err);
    } finally {
        await pool.end();
    }
}

verify();
