process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: "postgresql://postgres.juxsbziugyvjocfflako:03012004sSanobar@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log('🚀 Initializing MALI Monetary System Migration...');

        // 1. Add total_issued to platform_balance
        console.log('Adding total_issued column to platform_balance...');
        await pool.query(`
            ALTER TABLE platform_balance 
            ADD COLUMN IF NOT EXISTS total_issued DECIMAL(20, 4) DEFAULT 0.0000
        `);

        // 2. Ensure all users have token_balances entries
        console.log('Synchronizing token_balances for all users...');
        await pool.query(`
            INSERT INTO token_balances (user_id, balance, locked_balance)
            SELECT id, 0, 0 FROM users
            ON CONFLICT (user_id) DO NOTHING
        `);

        // 3. Initialize total_issued based on current user balances (Audit)
        console.log('Calculating current circulation...');
        const stats = await pool.query(`
            SELECT 
                (SELECT SUM(balance) FROM token_balances) as user_total,
                (SELECT balance FROM platform_balance WHERE id = 1) as treasury
        `);

        const currentCirculation = parseFloat(stats.rows[0].user_total || 0) + parseFloat(stats.rows[0].treasury || 0);

        await pool.query(`
            UPDATE platform_balance 
            SET total_issued = $1 
            WHERE id = 1
        `, [currentCirculation]);

        console.log(`✅ Monetary system initialized. Total Issued: ${currentCirculation} MALI`);
    } catch (e) {
        console.error('❌ Migration failed:', e);
    } finally {
        await pool.end();
    }
}

migrate();
