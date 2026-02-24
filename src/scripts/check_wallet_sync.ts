process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: "postgresql://postgres.juxsbziugyvjocfflako:03012004sSanobar@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        const walletCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'wallets'");
        console.log('Wallets Columns:', walletCols.rows.map(r => r.column_name));

        const tokenCols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'token_balances'");
        console.log('Token Balances Columns:', tokenCols.rows.map(r => r.column_name));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
