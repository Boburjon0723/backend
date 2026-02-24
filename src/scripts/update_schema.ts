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
        console.log('Starting migration...');

        // Add phone_number column
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='phone_number') THEN 
                    ALTER TABLE users ADD COLUMN phone_number VARCHAR(20) UNIQUE; 
                END IF; 
            END $$;
        `);
        console.log('Added phone_number column');

        // Add surname column
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='surname') THEN 
                    ALTER TABLE users ADD COLUMN surname VARCHAR(100); 
                END IF; 
            END $$;
        `);
        console.log('Added surname column');

        // Add age column
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='age') THEN 
                    ALTER TABLE users ADD COLUMN age INTEGER; 
                END IF; 
            END $$;
        `);
        console.log('Added age column');

        // Make email nullable if it exists
        await pool.query(`
             ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
        `);
        console.log('Made email nullable');

        // Add username column if missing
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='username') THEN 
                    ALTER TABLE users ADD COLUMN username VARCHAR(50); 
                END IF; 
            END $$;
        `);
        console.log('Added username column');

        // Add bio column if missing
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='bio') THEN 
                    ALTER TABLE users ADD COLUMN bio TEXT; 
                END IF; 
            END $$;
        `);
        console.log('Added bio column');

        // Add birthday column if missing
        await pool.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='birthday') THEN 
                    ALTER TABLE users ADD COLUMN birthday DATE; 
                END IF; 
            END $$;
        `);
        console.log('Added birthday column');

        // Create user_profiles table if missing
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                bio TEXT DEFAULT '',
                is_expert BOOLEAN DEFAULT FALSE,
                profession VARCHAR(100) DEFAULT '',
                specialization TEXT DEFAULT '',
                experience_years INTEGER DEFAULT 0,
                service_price NUMERIC(15, 2) DEFAULT 0,
                working_hours VARCHAR(100) DEFAULT '',
                languages TEXT DEFAULT '',
                verified_status VARCHAR(20) DEFAULT 'unverified',
                wiloyat VARCHAR(50) DEFAULT '',
                tuman VARCHAR(50) DEFAULT '',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Created/Updated user_profiles table');


        console.log('Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
