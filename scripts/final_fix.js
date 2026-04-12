const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function fix() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('DATABASE_URL is missing!');
        return;
    }

    console.log('Connecting to:', dbUrl.split('@')[1]);
    const client = new Client({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected to Supabase!');

        const sql = `
            DO $$ 
            BEGIN 
                -- Add columns one by one to avoid stopping on first error
                BEGIN ALTER TABLE user_profiles ADD COLUMN specialization_details TEXT; EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'specialization_details exists'; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN has_diploma BOOLEAN DEFAULT FALSE; EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'has_diploma exists'; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN institution VARCHAR(255); EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'institution exists'; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN current_workplace VARCHAR(255); EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'current_workplace exists'; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN diploma_url TEXT; EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'diploma_url exists'; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN certificate_url TEXT; EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'certificate_url exists'; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN id_url TEXT; EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'id_url exists'; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN selfie_url TEXT; EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'selfie_url exists'; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN resume_url TEXT; EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'resume_url exists'; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN hourly_rate DECIMAL(20, 4) DEFAULT 0; EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'hourly_rate exists'; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN currency VARCHAR(10) DEFAULT 'MALI'; EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'currency exists'; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN service_languages TEXT; EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'service_languages exists'; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN service_format VARCHAR(100); EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'service_format exists'; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN bio_expert TEXT; EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'bio_expert exists'; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN specialty_desc TEXT; EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'specialty_desc exists'; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN services_json JSONB; EXCEPTION WHEN duplicate_column THEN RAISE NOTICE 'services_json exists'; END;
            END $$;
        `;

        await client.query(sql);
        console.log('Columns checked/added successfully.');

        // Sanity check
        const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'user_profiles' AND column_name = 'resume_url'");
        if (res.rows.length > 0) {
            console.log('SUCCESS: resume_url is present.');
        } else {
            console.log('FAILURE: resume_url is still missing.');
        }

    } catch (err) {
        console.error('CRITICAL ERROR:', err.message);
    } finally {
        await client.end();
    }
}

fix();
