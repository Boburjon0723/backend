import { pool } from '../src/config/database';

async function migrate() {
    console.log('Starting migration: Adding missing expert fields...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const columns = [
            { name: 'rating', type: 'DECIMAL(3,2) DEFAULT 0' },
            { name: 'total_reviews', type: 'INTEGER DEFAULT 0' }
        ];

        for (const col of columns) {
            await client.query(`
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                                   WHERE table_name='user_profiles' AND column_name='${col.name}') THEN
                        ALTER TABLE user_profiles ADD COLUMN ${col.name} ${col.type};
                    END IF;
                END $$;
            `);
            console.log(`Column ${col.name} checked/added.`);
        }

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
