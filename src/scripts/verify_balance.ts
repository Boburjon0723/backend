process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: "postgresql://postgres.juxsbziugyvjocfflako:03012004sSanobar@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        const res = await pool.query("SELECT u.name, tb.balance FROM users u JOIN token_balances tb ON u.id = tb.user_id WHERE u.name = 'Boburjon'");
        console.log('Balances:', res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
