import { pool } from '../src/config/database';

async function checkUsersSchema() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users'
        `);
        console.log('--- Users Table Columns ---');
        console.table(res.rows);

        const data = await pool.query('SELECT * FROM users LIMIT 1');
        console.log('Sample User Data Keys:', Object.keys(data.rows[0]));

    } catch (err) {
        console.error('Check users schema failed:', err);
    } finally {
        await pool.end();
    }
}

checkUsersSchema();
