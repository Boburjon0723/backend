
const { Pool } = require('pg');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
dotenv.config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function seed() {
    try {
        console.log('Seeding database with test users...');
        const hashedPassword = await bcrypt.hash('password123', 10);

        const testUsers = [
            { id: uuidv4(), name: 'Ali', phone: '+998901234567', username: 'ali_dev' },
            { id: uuidv4(), name: 'Vali', phone: '+998907654321', username: 'vali_pro' },
            { id: uuidv4(), name: 'Sanobar', phone: '+998911112233', username: 'sanobar01' }
        ];

        for (const user of testUsers) {
            await pool.query(
                'INSERT INTO users (id, name, phone, username, password) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (phone) DO NOTHING',
                [user.id, user.name, user.phone, user.username, hashedPassword]
            );
        }

        const usersRes = await pool.query('SELECT id FROM users LIMIT 3');
        const userIds = usersRes.rows.map(r => r.id);

        if (userIds.length >= 2) {
            console.log('Adding contacts for first two users...');
            await pool.query(
                'INSERT INTO user_contacts (user_id, contact_user_id, name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                [userIds[0], userIds[1], 'Vali']
            );
            await pool.query(
                'INSERT INTO user_contacts (user_id, contact_user_id, name) VALUES ($2, $1, $3) ON CONFLICT DO NOTHING',
                [userIds[0], userIds[1], 'Ali']
            );
        }

        console.log('✅ Seeding complete!');

    } catch (err) {
        console.error('SEED ERROR:', err.message);
    } finally {
        await pool.end();
    }
}

seed();
