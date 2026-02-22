import { pool } from '../src/config/database';

async function checkConstraint() {
    try {
        const result = await pool.query(`
            SELECT pg_get_constraintdef(c.oid) as definition
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            WHERE t.relname = 'p2p_ads' AND c.conname = 'p2p_ads_status_check';
        `);
        console.log('Constraint definition:', result.rows[0]?.definition);
    } catch (error) {
        console.error('Error checking constraint:', error);
    } finally {
        process.exit();
    }
}

checkConstraint();
