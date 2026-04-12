import { pool } from '../src/config/database';

async function checkConstraints() {
    try {
        const result = await pool.query(`
            SELECT conname, contype, pg_get_constraintdef(c.oid)
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE n.nspname = 'public' AND (conrelid = 'users'::regclass OR conrelid = 'user_profiles'::regclass)
        `);
        console.log('Constraints on users/user_profiles:');
        result.rows.forEach(row => console.log(`- ${row.conname} (${row.contype}): ${row.pg_get_constraintdef}`));
    } catch (error) {
        console.error('Error checking constraints:', error);
    } finally {
        process.exit();
    }
}

checkConstraints();
