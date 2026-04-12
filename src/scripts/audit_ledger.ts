process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function audit() {
    try {
        console.log('🔍 Starting MALI Supply Audit...');

        const res = await pool.query(`
            SELECT 
                (SELECT SUM(balance) + SUM(locked_balance) FROM token_balances) as user_total,
                (SELECT balance FROM platform_balance WHERE id = 1) as treasury_total,
                (SELECT SUM(amount) FROM escrow WHERE status = 'held') as escrow_total,
                (SELECT total_issued FROM platform_balance WHERE id = 1) as official_supply
        `);

        const userTotal = parseFloat(res.rows[0].user_total || 0);
        const treasuryTotal = parseFloat(res.rows[0].treasury_total || 0);
        const escrowTotal = parseFloat(res.rows[0].escrow_total || 0);
        const officialSupply = parseFloat(res.rows[0].official_supply || 0);

        const actualSum = userTotal + treasuryTotal + escrowTotal;
        const difference = actualSum - officialSupply;

        console.log('--- Results ---');
        console.log(`👥 User Circulation: ${userTotal} MALI`);
        console.log(`🏦 Treasury Balance: ${treasuryTotal} MALI`);
        console.log(`🔒 Escrow/Held:      ${escrowTotal} MALI`);
        console.log('----------------');
        console.log(`🧮 Calculated Sum:   ${actualSum} MALI`);
        console.log(`📜 Official Supply:  ${officialSupply} MALI`);

        if (Math.abs(difference) < 0.0001) {
            console.log('✅ Audit Passed: Supply is consistent.');
        } else {
            console.error(`⚠️ AUDIT FAILED! Difference: ${difference} MALI`);
            console.error('Money has been created or destroyed without authorization.');
        }

    } catch (e) {
        console.error('❌ Audit failed:', e);
    } finally {
        await pool.end();
    }
}

audit();
