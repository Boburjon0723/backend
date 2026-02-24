process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: "postgresql://postgres.juxsbziugyvjocfflako:03012004sSanobar@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log('🚀 Adding created_at to user_profiles...');
        await pool.query(`
            ALTER TABLE user_profiles 
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        `);
        console.log('✅ Column added successfully.');
    } catch (e) {
        console.error('❌ Migration failed:', e);
    } finally {
        await pool.end();
    }
}

migrate();
