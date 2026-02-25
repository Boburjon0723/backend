import { pool } from './src/config/database';
import fs from 'fs';
import path from 'path';

async function runMigration() {
    try {
        const sqlPath = path.join(__dirname, 'add_birthday.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('Running migration...');
        await pool.query(sql);
        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

runMigration();
