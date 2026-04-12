const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load .env explicitly
const envPath = path.join(__dirname, '../.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('Error loading .env file:', result.error);
    process.exit(1);
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error('DATABASE_URL is not defined in .env');
    process.exit(1);
}

console.log('Using DATABASE_URL:', dbUrl.split('@')[1] || dbUrl); // Hide password

const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    let client;
    try {
        client = await pool.connect();
        console.log('Connected to database successfully.');

        await client.query('BEGIN');

        console.log('Adding missing columns to user_profiles...');
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

        // Also check if is_expert is accidentally in users table and log it
        const checkUsers = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'is_expert'
        `);
        if (checkUsers.rows.length > 0) {
            console.log('WARNING: is_expert column found in USERS table. This might be causing issues.');
        }

        await client.query('COMMIT');
        console.log('Migration complete!');
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error('Migration error:', err.message);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

runMigration();
