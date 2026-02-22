import dotenv from 'dotenv';
dotenv.config();
import { pool } from '../config/database';

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


        console.log('Migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
};

migrate();
