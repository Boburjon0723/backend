import { pool } from '../src/config/database';

async function checkSchema() {
    try {
        const result = await pool.query("SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name = 'users'");
        console.log('Columns in users:');
        result.rows.forEach(row => console.log(`- ${row.column_name}: ${row.data_type} (${row.character_maximum_length || 'no limit'})`));
    } catch (error) {
        console.error('Error checking schema:', error);
    } finally {
        process.exit();
    }
}

checkSchema();
