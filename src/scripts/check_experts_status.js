
const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function checkExperts() {
    try {
        const res = await pool.query(`
            SELECT u.id, u.name, u.surname, p.is_expert, p.verified_status, p.profession
            FROM users u
            JOIN user_profiles p ON u.id = p.user_id
            WHERE p.is_expert = true OR p.verified_status IN ('approved', 'pending')
        `);
        console.log('--- Expert Status Report ---');
        console.table(res.rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkExperts();
