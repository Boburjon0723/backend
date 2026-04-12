import { pool } from '../src/config/database';

async function fixConstraint() {
    try {
        console.log('Dropping old constraint...');
        await pool.query('ALTER TABLE p2p_ads DROP CONSTRAINT IF EXISTS p2p_ads_status_check');

        console.log('Adding updated constraint with "cancelled" status...');
        await pool.query(`
            ALTER TABLE p2p_ads 
            ADD CONSTRAINT p2p_ads_status_check 
            CHECK (status = ANY (ARRAY['active', 'paused', 'closed', 'completed', 'cancelled']))
        `);

        console.log('Constraint updated successfully!');
    } catch (error) {
        console.error('Error fixing constraint:', error);
    } finally {
        process.exit();
    }
}

fixConstraint();
