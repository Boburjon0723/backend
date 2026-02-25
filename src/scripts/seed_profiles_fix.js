const { Pool } = require('pg');
require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log('Seeding missing profiles...');
        const users = await pool.query('SELECT id FROM users');
        for (const user of users.rows) {
            await pool.query(`
                INSERT INTO user_profiles (user_id, verified_status)
                VALUES ($1, 'unverified')
                ON CONFLICT (user_id) DO NOTHING
            `, [user.id]);
        }
        console.log('Finished seeding profiles.');

        console.log('Re-running triggers script...');
        await pool.query(`
            CREATE OR REPLACE FUNCTION handle_new_user()
            RETURNS TRIGGER AS $$
            BEGIN
                INSERT INTO token_balances (user_id, balance)
                VALUES (NEW.id, 0.0000)
                ON CONFLICT (user_id) DO NOTHING;

                INSERT INTO user_profiles (user_id, verified_status)
                VALUES (NEW.id, 'unverified')
                ON CONFLICT (user_id) DO NOTHING;

                RETURN NEW;
            END;
            $$ language 'plpgsql';

            DROP TRIGGER IF EXISTS on_user_created ON users;
            CREATE TRIGGER on_user_created
            AFTER INSERT ON users
            FOR EACH ROW EXECUTE FUNCTION handle_new_user();
        `);
        console.log('Triggers ensured.');
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
