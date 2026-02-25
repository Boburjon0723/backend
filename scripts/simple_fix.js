const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

async function fix() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected!');

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

        for (const col of columns) {
            const name = col.split(' ')[0];
            try {
                await client.query(`ALTER TABLE user_profiles ADD COLUMN ${col}`);
                console.log(`Added ${name}`);
            } catch (e) {
                if (e.code === '42701') {
                    console.log(`${name} already exists`);
                } else {
                    console.log(`Error adding ${name}: ${e.message}`);
                }
            }
        }
    } catch (err) {
        console.error('Connection error:', err.message);
    } finally {
        await client.end();
    }
}

fix();
