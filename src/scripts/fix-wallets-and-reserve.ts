import { pool } from '../config/database';

async function fixWalletsAndReserve() {
    const client = await pool.connect();
    try {
        console.log("Fixing Wallet System and Central Reserve...");

        await client.query('BEGIN');

        // 1. Create Wallets Table if not exists (just in case)
        await client.query(`
            CREATE TABLE IF NOT EXISTS wallets (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
                balance NUMERIC(20, 4) DEFAULT 0 CHECK (balance >= 0),
                pin_hash VARCHAR(255),
                is_locked BOOLEAN DEFAULT FALSE,
                recovery_requested_at TIMESTAMP WITH TIME ZONE,
                recovery_status VARCHAR(20) DEFAULT 'none' CHECK (recovery_status IN ('none', 'pending', 'approved', 'rejected')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Create Central Reserve User
        const centralUserRes = await client.query(`
            INSERT INTO users (name, surname, email, phone, password_hash, role)
            VALUES ('Central', 'Reserve', 'reserve@mali.system', '0000000000', 'SYSTEM_ACCOUNT_DO_NOT_LOGIN', 'admin')
            ON CONFLICT (email) DO UPDATE SET role = 'admin'
            RETURNING id;
        `);

        let centralUserId = centralUserRes.rows[0]?.id;
        if (!centralUserId) {
            const fetchId = await client.query(`SELECT id FROM users WHERE email = 'reserve@mali.system'`);
            centralUserId = fetchId.rows[0]?.id;
        }

        console.log(`🏦 Central Reserve User ID: ${centralUserId}`);

        // 3. Initialize Central Wallet with 100M MALI
        await client.query(`
            INSERT INTO wallets (user_id, balance, pin_hash)
            VALUES ($1, 100000000, 'SYSTEM_PIN')
            ON CONFLICT (user_id) DO UPDATE SET balance = GREATEST(wallets.balance, EXCLUDED.balance)
        `, [centralUserId]);

        console.log("💰 Central Reserve Wallet initialized.");

        // 4. Create Wallets for ALL Existing Users (especially admins)
        const usersRes = await client.query(`SELECT id, email FROM users`);
        for (const user of usersRes.rows) {
            await client.query(`
                INSERT INTO wallets (user_id, balance)
                VALUES ($1, 0)
                ON CONFLICT (user_id) DO NOTHING
            `, [user.id]);
        }
        console.log(`👥 Ensured wallets for all ${usersRes.rows.length} users.`);

        await client.query('COMMIT');
        console.log("✅ Fix complete.");

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("❌ Fix failed:", error);
    } finally {
        client.release();
        process.exit();
    }
}

fixWalletsAndReserve();
