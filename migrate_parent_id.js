
const { pool } = require('./dist/config/database');

async function migrate() {
    try {
        console.log('Migrating: Adding parent_id to messages table...');
        await pool.query(`
            ALTER TABLE messages 
            ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES messages(id) ON DELETE SET NULL;
        `);
        console.log('Migration successful.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        process.exit();
    }
}

migrate();
