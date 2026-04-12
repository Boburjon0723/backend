process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function addTriggers() {
    try {
        console.log('🚀 Creating auto-creation triggers...');

        await pool.query(`
            -- Function to handle new user creation
            CREATE OR REPLACE FUNCTION handle_new_user()
            RETURNS TRIGGER AS $$
            BEGIN
                -- 1. Create Token Balance
                INSERT INTO token_balances (user_id, balance)
                VALUES (NEW.id, 0.0000)
                ON CONFLICT (user_id) DO NOTHING;

                -- 2. Create User Profile
                INSERT INTO user_profiles (user_id, verified_status)
                VALUES (NEW.id, 'unverified')
                ON CONFLICT (user_id) DO NOTHING;

                RETURN NEW;
            END;
            $$ language 'plpgsql';

            -- Trigger execution
            DROP TRIGGER IF EXISTS on_user_created ON users;
            CREATE TRIGGER on_user_created
            AFTER INSERT ON users
            FOR EACH ROW EXECUTE FUNCTION handle_new_user();
        `);

        console.log('✅ Triggers created successfully.');
    } catch (e) {
        console.error('❌ Failed to create triggers:', e);
    } finally {
        await pool.end();
    }
}

addTriggers();
