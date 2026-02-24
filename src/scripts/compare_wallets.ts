process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: "postgresql://postgres.juxsbziugyvjocfflako:03012004sSanobar@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        const wallets = await pool.query("SELECT COUNT(*) FROM wallets");
        const token_balances = await pool.query("SELECT COUNT(*) FROM token_balances");
        console.log('Wallets Count:', wallets.rows[0].count);
        console.log('Token Balances Count:', token_balances.rows[0].count);

        const walletSample = await pool.query("SELECT * FROM wallets LIMIT 1");
        console.log('Wallets Sample:', walletSample.rows);

        const tokenSample = await pool.query("SELECT * FROM token_balances LIMIT 1");
        console.log('Token Balances Sample:', tokenSample.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
