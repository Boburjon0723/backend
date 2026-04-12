const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
console.log('Connecting to:', dbUrl.split('@')[1]);

const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

async function check() {
    try {
        await client.connect();
        console.log('Connected!');

        const resUsers = await client.query(`
            SELECT column_name FROM information_schema.columns WHERE table_name = 'users'
        `);
        console.log('Users columns:', resUsers.rows.map(r => r.column_name).join(', '));

        const resProfiles = await client.query(`
            SELECT column_name FROM information_schema.columns WHERE table_name = 'user_profiles'
        `);
        console.log('Profiles columns:', resProfiles.rows.map(r => r.column_name).join(', '));

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await client.end();
    }
}

check();
