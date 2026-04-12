import { pool } from '../src/config/database';

async function checkSchema() {
    try {
        const result = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user_profiles'");
        console.log('Columns in user_profiles:');
        result.rows.forEach(row => console.log(`- ${row.column_name}: ${row.data_type}`));
    } catch (error) {
        console.error('Error checking schema:', error);
    } finally {
        process.exit();
    }
}

checkSchema();
