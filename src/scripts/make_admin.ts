process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function findAndMakeAdmin(phone: string) {
    try {
        console.log(`Checking user with phone: ${phone}`);
        const res = await pool.query('SELECT id, name, username, role FROM users WHERE phone = $1', [phone]);

        const salt = await bcrypt.genSalt(10);
        const newPasswordHash = await bcrypt.hash('admin123', salt);

        if (res.rows.length === 0) {
            console.log('User not found. Creating new admin...');
            await pool.query(
                "INSERT INTO users (id, phone, password_hash, name, role) VALUES (gen_random_uuid(), $1, $2, 'Admin', 'admin')",
                [phone, newPasswordHash]
            );
            console.log('✅ New admin created with phone:', phone);
        } else {
            const user = res.rows[0];
            console.log(`User found: ${user.username}, Role: ${user.role}`);

            console.log('Updating role to admin and resetting password...');
            await pool.query(
                "UPDATE users SET role = 'admin', password_hash = $1 WHERE id = $2",
                [newPasswordHash, user.id]
            );
            console.log('✅ Admin credentials updated! Password is: admin123');
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}

const phoneArg = process.argv[2] || '+998950203601';
findAndMakeAdmin(phoneArg);
