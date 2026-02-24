import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function manageExpert(action: string, identifier: string) {
    try {
        let userId = identifier;

        // If identifier is not UUID, assume it's a username
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)) {
            const userRes = await pool.query('SELECT id FROM users WHERE username = $1', [identifier]);
            if (userRes.rows.length === 0) {
                console.error(`User topilmadi: ${identifier}`);
                return;
            }
            userId = userRes.rows[0].id;
        }

        let status = 'none';
        let isExpert = false;

        if (action === 'approve') {
            status = 'approved';
            isExpert = true;
        } else if (action === 'reject') {
            status = 'rejected';
            isExpert = false;
        } else if (action === 'pending') {
            status = 'pending';
            isExpert = true;
        } else {
            console.error('Noma\'lum amal: approve, reject, pending');
            return;
        }

        await pool.query('BEGIN');

        // Ensure profile exists
        const profileCheck = await pool.query('SELECT user_id FROM user_profiles WHERE user_id = $1', [userId]);
        if (profileCheck.rows.length === 0) {
            await pool.query('INSERT INTO user_profiles (user_id, verified_status, is_expert) VALUES ($1, $2, $3)', [userId, status, isExpert]);
        } else {
            await pool.query('UPDATE user_profiles SET verified_status = $1, is_expert = $2 WHERE user_id = $3', [status, isExpert, userId]);
        }

        await pool.query('COMMIT');
        console.log(`\n✅ Muvaffaqiyatli: Foydalanuvchi (${identifier}) holati '${status}' ga o'zgartirildi.\n`);

    } catch (e) {
        await pool.query('ROLLBACK');
        console.error('Xatolik:', e);
    } finally {
        await pool.end();
    }
}

const args = process.argv.slice(2);
if (args.length < 2) {
    console.log('Foydalanish: npx ts-node src/scripts/manage_experts.ts <approve|reject|pending> <username_yoki_uuid>');
    process.exit(0);
}

manageExpert(args[0], args[1]);
