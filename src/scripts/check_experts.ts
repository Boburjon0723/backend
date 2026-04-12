import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function checkExperts() {
    try {
        const query = `
            SELECT u.id, u.name, u.username, p.is_expert, p.verified_status, p.profession, p.specialization_details, p.created_at
            FROM users u
            LEFT JOIN user_profiles p ON u.id = p.user_id
            WHERE p.is_expert = true OR p.verified_status != 'none'
            ORDER BY p.created_at DESC;
        `;
        const result = await pool.query(query);

        console.log('\n--- MUTAXASSISLAR RO\'YXATI (DB) ---');
        console.table(result.rows.map(row => ({
            ID: row.id.substring(0, 8) + '...',
            Ism: row.name,
            Username: row.username,
            Expert: row.is_expert,
            Status: row.verified_status,
            Kasb: row.profession
        })));
        console.log('------------------------------------\n');
    } catch (e) {
        console.error('Xatolik:', e);
    } finally {
        await pool.end();
    }
}

checkExperts();
