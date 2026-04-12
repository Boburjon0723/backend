const { Client } = require('pg');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function verifyAndFix() {
    try {
        await client.connect();
        console.log('Verifying table: listing_service_deals...');

        // Check columns and defaults
        const res = await client.query(`
            SELECT column_name, column_default, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'listing_service_deals' AND column_name = 'id'
        `);
        console.log('Current ID column info:', res.rows[0]);

        // Re-apply extension and default
        await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
        console.log('Applying force fix...');
        await client.query('ALTER TABLE listing_service_deals ALTER COLUMN id SET DEFAULT uuid_generate_v4()');
        
        // Final verification
        const res2 = await client.query(`
            SELECT column_name, column_default 
            FROM information_schema.columns 
            WHERE table_name = 'listing_service_deals' AND column_name = 'id'
        `);
        console.log('Updated ID column info:', res2.rows[0]);

        console.log('--- DONE ---');
    } catch (err) {
        console.error('FAILED:', err);
    } finally {
        await client.end();
    }
}

verifyAndFix();
