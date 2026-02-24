process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: "postgresql://postgres.juxsbziugyvjocfflako:03012004sSanobar@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        const txCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'transactions'");
        console.log('Transactions Columns:', txCols.rows);

        const profCols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'user_profiles'");
        console.log('User Profiles Columns:', profCols.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

check();
