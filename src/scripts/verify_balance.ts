process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
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
