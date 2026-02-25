const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function applyMigration() {
    const client = await pool.connect();
    try {
        console.log('Applying database migration...');
        await client.query('BEGIN');

        const sql = `
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS specialization_details TEXT;
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS has_diploma BOOLEAN DEFAULT FALSE;
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS institution VARCHAR(255);
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS current_workplace VARCHAR(255);
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS diploma_url TEXT;
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS certificate_url TEXT;
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS id_url TEXT;
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS selfie_url TEXT;
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS resume_url TEXT;
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(20, 4) DEFAULT 0;
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'MALI';
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS service_languages TEXT;
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS service_format VARCHAR(100);
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS bio_expert TEXT;
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS specialty_desc TEXT;
            ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS services_json JSONB;
        `;

        await client.query(sql);
        await client.query('COMMIT');
        console.log('Migration applied successfully!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

applyMigration();
