
const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkDb() {
    try {
        console.log('Checking USERS table...');
        const users = await pool.query('SELECT id, name, phone FROM users');
        console.log('USERS FOUND:', users.rows.length);
        if (users.rows.length > 0) {
            console.log('User IDs:', users.rows.map(u => u.id));
        }

        console.log('Checking CONTACTS table...');
        const contacts = await pool.query('SELECT * FROM user_contacts');
        console.log('CONTACTS FOUND:', contacts.rows.length);

    } catch (err) {
        console.error('DB CHECK ERROR:', err.message);
    } finally {
        await pool.end();
    }
}

checkDb();
