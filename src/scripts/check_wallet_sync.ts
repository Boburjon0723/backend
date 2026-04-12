process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
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
