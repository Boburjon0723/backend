import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') || process.env.DATABASE_URL?.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false }
});

const migrate = async () => {
    try {
        console.log('Starting expert fields migration...');

        await pool.query(`
            DO $$ 
            BEGIN 
                -- Add text details for specialization
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='specialization_details') THEN 
                    ALTER TABLE user_profiles ADD COLUMN specialization_details TEXT DEFAULT ''; 
                END IF;

                -- Educational info
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='has_diploma') THEN 
                    ALTER TABLE user_profiles ADD COLUMN has_diploma BOOLEAN DEFAULT FALSE; 
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='institution') THEN 
                    ALTER TABLE user_profiles ADD COLUMN institution VARCHAR(200) DEFAULT ''; 
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='current_workplace') THEN 
                    ALTER TABLE user_profiles ADD COLUMN current_workplace VARCHAR(200) DEFAULT ''; 
                END IF;

                -- Document URLs
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='diploma_url') THEN 
                    ALTER TABLE user_profiles ADD COLUMN diploma_url TEXT DEFAULT ''; 
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='certificate_url') THEN 
                    ALTER TABLE user_profiles ADD COLUMN certificate_url TEXT DEFAULT ''; 
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='id_url') THEN 
                    ALTER TABLE user_profiles ADD COLUMN id_url TEXT DEFAULT ''; 
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='selfie_url') THEN 
                    ALTER TABLE user_profiles ADD COLUMN selfie_url TEXT DEFAULT ''; 
                END IF;

                -- Pricing & Service details
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='hourly_rate') THEN 
                    ALTER TABLE user_profiles ADD COLUMN hourly_rate NUMERIC(15, 2) DEFAULT 0; 
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='currency') THEN 
                    ALTER TABLE user_profiles ADD COLUMN currency VARCHAR(10) DEFAULT 'MALI'; 
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='service_languages') THEN 
                    ALTER TABLE user_profiles ADD COLUMN service_languages TEXT DEFAULT ''; 
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='service_format') THEN 
                    ALTER TABLE user_profiles ADD COLUMN service_format VARCHAR(100) DEFAULT ''; 
                END IF;

                -- Descriptions
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='bio_expert') THEN 
                    ALTER TABLE user_profiles ADD COLUMN bio_expert TEXT DEFAULT ''; 
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='specialty_desc') THEN 
                    ALTER TABLE user_profiles ADD COLUMN specialty_desc TEXT DEFAULT ''; 
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='services_json') THEN 
                    ALTER TABLE user_profiles ADD COLUMN services_json JSONB DEFAULT '[]'; 
                END IF;

            END $$;
        `);

        console.log('Migration for expert fields completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
