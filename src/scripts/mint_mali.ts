process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: "postgresql://postgres.juxsbziugyvjocfflako:03012004sSanobar@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function mint(amount: number) {
    if (amount <= 0) {
        console.error('❌ Amount must be greater than 0');
        return;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        console.log(`🪙 Minting ${amount} MALI...`);

        // 1. Update platform_balance (Add to both total_issued and balance/treasury)
        const updateRes = await client.query(`
            UPDATE platform_balance 
            SET total_issued = total_issued + $1,
                balance = balance + $1
            WHERE id = 1
            RETURNING total_issued, balance
        `, [amount]);

        const newTotal = updateRes.rows[0].total_issued;
        const newTreasury = updateRes.rows[0].balance;

        // 2. Record Transaction
        await client.query(`
            INSERT INTO transactions (id, sender_id, receiver_id, amount, net_amount, type, status, note)
            VALUES (gen_random_uuid(), NULL, NULL, $1, $1, 'MINT', 'completed', 'Central Bank Minting')
        `, [amount]);

        await client.query('COMMIT');
        console.log(`✅ Minting Successful!`);
        console.log(`📊 New Total Supply: ${newTotal} MALI`);
        console.log(`🏦 Treasury Balance: ${newTreasury} MALI`);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ Minting failed:', e);
    } finally {
        client.release();
        await pool.end();
    }
}

const amountArg = parseFloat(process.argv[2]);
if (isNaN(amountArg)) {
    console.error('Usage: ts-node mint_mali.ts <amount>');
    process.exit(1);
}

mint(amountArg);
