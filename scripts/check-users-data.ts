import { pool } from '../src/config/database';

async function checkUsers() {
    try {
        const res = await pool.query('SELECT COUNT(*) FROM users');
        console.log(`Total users in table: ${res.rows[0].count}`);

        const data = await pool.query('SELECT id, name, surname, phone_number, username FROM users LIMIT 10');
        console.log('Sample Users:');
        console.table(data.rows);

    } catch (err) {
        console.error('Check users failed:', err);
    } finally {
        await pool.end();
    }
}

checkUsers();
