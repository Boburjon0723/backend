const { Client } = require('pg');
require('dotenv').config();

const url = 'postgresql://postgres.juxsbziugyvjocfflako:03012004sSanobar@aws-1-ap-south-1.pooler.supabase.com:5432/postgres';
console.log('--- DB Connection Test Started (NO SSL, Port 5432) ---');

const client = new Client({
    connectionString: url,
    ssl: false,
    connectionTimeoutMillis: 10000
});

const start = Date.now();
client.connect()
    .then(() => {
        console.log('✅ CONNECTED!');
        return client.query('SELECT NOW() as now');
    })
    .catch(err => {
        console.log('❌ FAILED (Expected if SSL is required, but good if it happens fast)');
        console.error(err.message);
        process.exit(0);
    });

setTimeout(() => {
    console.error('❌ GLOBAL TIMEOUT (15s)');
    process.exit(1);
}, 15000);
