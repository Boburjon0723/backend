process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: "postgresql://postgres.juxsbziugyvjocfflako:03012004sSanobar@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        const query = `
            SELECT t.*, s.name as sender_name, r.name as receiver_name 
            FROM transactions t
            LEFT JOIN users s ON t.sender_id = s.id
            LEFT JOIN users r ON t.receiver_id = r.id
            ORDER BY t.created_at DESC LIMIT 100
        `;
        const result = await pool.query(query);
        console.log('Query successful. Row count:', result.rows.length);
        if (result.rows.length > 0) {
            console.log('First row:', result.rows[0]);
        }
    } catch (e) {
        console.error('SQL Error detected:', e);
    } finally {
        await pool.end();
    }
}

check();
