import { pool } from '../config/database';

async function migrate() {
    console.log("Starting wallet migrations...");
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            CREATE TABLE IF NOT EXISTS platform_settings (
                id SERIAL PRIMARY KEY,
                expert_subscription_fee DECIMAL(10,2) DEFAULT 20.00,
                commission_rate DECIMAL(4,2) DEFAULT 0.10,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            INSERT INTO platform_settings (id, expert_subscription_fee, commission_rate)
            VALUES (1, 20.00, 0.10)
            ON CONFLICT (id) DO NOTHING;
        `);

        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_expert_active BOOLEAN DEFAULT false;
        `);

        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP WITH TIME ZONE;
        `);

        await client.query(`
            ALTER TABLE token_balances ADD COLUMN IF NOT EXISTS locked_balance DECIMAL(15, 2) DEFAULT 0.00;
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS platform_balance (
                id SERIAL PRIMARY KEY,
                balance DECIMAL(15, 2) DEFAULT 0.00,
                total_fees_collected DECIMAL(15, 2) DEFAULT 0.00,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            INSERT INTO platform_balance (id, balance, total_fees_collected)
            VALUES (1, 0.00, 0.00)
            ON CONFLICT (id) DO NOTHING;
        `);

        await client.query('COMMIT');
        console.log("Migrations applied successfully!");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Migration failed:", e);
    } finally {
        client.release();
        process.exit(0);
    }
}

migrate();
