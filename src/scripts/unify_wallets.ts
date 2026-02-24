process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: "postgresql://postgres.juxsbziugyvjocfflako:03012004sSanobar@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function unify() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log('🚀 Phase 1: Adding columns to token_balances...');
        await client.query(`
            ALTER TABLE token_balances 
            ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255),
            ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS recovery_status VARCHAR(50),
            ADD COLUMN IF NOT EXISTS recovery_requested_at TIMESTAMP WITH TIME ZONE
        `);

        console.log('🚀 Phase 2: Migrating data from wallets to token_balances...');
        // Only migrate if wallets table exists
        const tableCheck = await client.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'wallets'");
        if (tableCheck.rows.length > 0) {
            await client.query(`
                UPDATE token_balances tb
                SET pin_hash = w.pin_hash,
                    is_locked = w.is_locked,
                    recovery_status = w.recovery_status,
                    recovery_requested_at = w.recovery_requested_at
                FROM wallets w
                WHERE tb.user_id = w.user_id
            `);

            // For users who have a wallet but NO token_balance yet (rare but possible)
            await client.query(`
                INSERT INTO token_balances (user_id, balance, pin_hash, is_locked)
                SELECT user_id, balance, pin_hash, is_locked
                FROM wallets
                ON CONFLICT (user_id) DO NOTHING
            `);

            console.log('🚀 Phase 3: Dropping legacy wallets table...');
            // We'll keep it as wallets_backup for safety first? No, let's just drop if confident.
            // Actually, let's rename it just in case.
            await client.query('ALTER TABLE wallets RENAME TO wallets_legacy_backup');
        } else {
            console.log('⚠️ Wallets table not found, skipping migration.');
        }

        await client.query('COMMIT');
        console.log('✅ Unification complete!');
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Unification failed:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

unify();
