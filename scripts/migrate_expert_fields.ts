import { pool } from '../src/config/database';

async function migrate() {
    console.log('Starting migration: Adding expert fields to user_profiles...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Add columns if they don't exist
        const columns = [
            { name: 'is_expert', type: 'BOOLEAN DEFAULT FALSE' },
            { name: 'profession', type: 'VARCHAR(100)' },
            { name: 'specialization', type: 'TEXT' },
            { name: 'experience_years', type: 'INTEGER DEFAULT 0' },
            { name: 'service_price', type: 'DECIMAL(15,2) DEFAULT 0' },
            { name: 'working_hours', type: 'VARCHAR(100)' },
            { name: 'languages', type: 'TEXT' },
            { name: 'verified_status', type: 'VARCHAR(20) DEFAULT \'unverified\'' }
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
