import { pool } from '../src/config/database';

async function listTables() {
    try {
        const res = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);
        console.log('--- Database Tables ---');
        console.table(res.rows);

        // Check for common contact-related names
        for (const table of res.rows) {
            const name = table.table_name;
            if (name.includes('contact') || name.includes('friend') || name.includes('member')) {
                const countRes = await pool.query(`SELECT COUNT(*) FROM ${name}`);
                console.log(`Table: ${name}, Rows: ${countRes.rows[0].count}`);
            }
        }

    } catch (err) {
        console.error('Failed to list tables:', err);
    } finally {
        await pool.end();
    }
}

listTables();
