process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';

const pool = new Pool({
    connectionString: "postgresql://postgres.juxsbziugyvjocfflako:03012004sSanobar@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require",
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log('🚀 Updating user_profiles schema...');

        await pool.query(`
            ALTER TABLE user_profiles 
            ADD COLUMN IF NOT EXISTS specialization_details TEXT,
            ADD COLUMN IF NOT EXISTS institution VARCHAR(255),
            ADD COLUMN IF NOT EXISTS current_workplace VARCHAR(255),
            ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(20, 4) DEFAULT 0.0000,
            ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'MALI'
        `);

        // Sync hourly_rate with service_price if service_price exists
        await pool.query(`
            UPDATE user_profiles 
            SET hourly_rate = service_price 
            WHERE hourly_rate = 0 AND service_price > 0
        `);

        console.log('✅ user_profiles updated successfully.');
    } catch (e) {
        console.error('❌ Migration failed:', e);
    } finally {
        await pool.end();
    }
}

migrate();
