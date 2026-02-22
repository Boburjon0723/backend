import { pool } from '../src/config/database';

async function checkSchema() {
    try {
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'users'
        `);
        console.log('--- Users Table Columns ---');
        console.table(res.rows);

        const res2 = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'user_contacts'
        `);
        console.log('--- User Contacts Table Columns ---');
        console.table(res2.rows);

    } catch (err) {
        console.error('Check schema failed:', err);
    } finally {
        await pool.end();
    }
}

checkSchema();
