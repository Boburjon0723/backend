import { pool } from '../src/config/database';

async function checkP2PSchema() {
    try {
        const result = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'p2p_ads'");
        console.log('Columns in p2p_ads:');
        result.rows.forEach(row => console.log(`- ${row.column_name}: ${row.data_type}`));
    } catch (error) {
        console.error('Error checking schema:', error);
    } finally {
        process.exit();
    }
}

checkP2PSchema();
