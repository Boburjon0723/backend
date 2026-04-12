const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

async function check() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    try {
        await client.connect();
        const res = await client.query("SELECT user_id, verified_status FROM user_profiles LIMIT 10");
        console.log('Profiles found:', res.rows);
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await client.end();
    }
}
check();
