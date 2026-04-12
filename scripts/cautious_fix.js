const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env'), override: true });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function runSingle(sql) {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    try {
        await client.connect();
        await client.query(sql);
        return true;
    } catch (e) {
        if (e.code === '42701') return true; // Already exists
        console.error(`Error with [${sql}]:`, e.message);
        return false;
    } finally {
        await client.end();
    }
}

async function fix() {
    const columns = [
        'specialization_details TEXT',
        'has_diploma BOOLEAN DEFAULT FALSE',
        'institution VARCHAR(255)',
        'current_workplace VARCHAR(255)',
        'diploma_url TEXT',
        'certificate_url TEXT',
        'id_url TEXT',
        'selfie_url TEXT',
        'resume_url TEXT',
        'hourly_rate DECIMAL(20, 4) DEFAULT 0',
        'currency VARCHAR(10) DEFAULT \'MALI\'',
        'service_languages TEXT',
        'service_format VARCHAR(100)',
        'bio_expert TEXT',
        'specialty_desc TEXT',
        'services_json JSONB'
    ];

    console.log('Starting cautious migration...');
    for (const col of columns) {
        const name = col.split(' ')[0];
        const success = await runSingle(`ALTER TABLE user_profiles ADD COLUMN ${col}`);
        if (success) console.log(`Processed ${name}`);
        else console.log(`Failed ${name}`);
        // Small delay
        await new Promise(r => setTimeout(r, 500));
    }
    console.log('Migration attempt finished.');
}

fix();
