const { Client } = require('pg');

async function fix() {
    // Direct host (usually db.project-ref.supabase.co or similar)
    // Project ref from URL: juxsbziugyvjocfflako
    const client = new Client({
        host: 'db.juxsbziugyvjocfflako.supabase.co',
        port: 5432,
        user: 'postgres',
        password: '03012004sSanobar',
        database: 'postgres',
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to Direct Host!');

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
        console.log('Migration SUCCESS!');
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await client.end();
    }
}

fix();
