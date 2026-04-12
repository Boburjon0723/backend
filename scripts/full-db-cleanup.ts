import { pool } from '../src/config/database';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const ADMIN_PHONE = '+998950203601';

async function cleanupDatabase() {
    try {
        console.log('--- Database Cleanup Started ---');

        // 1. Identify Admin
        const adminRes = await pool.query('SELECT id FROM users WHERE phone = $1', [ADMIN_PHONE]);
        if (adminRes.rows.length === 0) {
            console.error(`Admin with phone ${ADMIN_PHONE} not found! Aborting.`);
            return;
        }
        const adminId = adminRes.rows[0].id;
        console.log(`Found Admin ID: ${adminId}`);

        // 2. Clear MongoDB (Chats and Messages)
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mali_platform';
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        if (db) {
            await db.collection('messages').deleteMany({});
            console.log('Cleared all MongoDB messages');
            await db.collection('chats').deleteMany({});
            console.log('Cleared all MongoDB chats');
        }

        // 3. Clear Postgres Tables (Careful with Foreign Keys)
        // Orders: transactions -> bookings -> services -> users

        console.log('Clearing Postgres tables...');

        await pool.query('DELETE FROM user_contacts');
        console.log('- user_contacts cleared');

        await pool.query('DELETE FROM notifications');
        console.log('- notifications cleared');

        await pool.query('DELETE FROM reviews');
        console.log('- reviews cleared');

        await pool.query('DELETE FROM escrow');
        console.log('- escrow cleared');

        await pool.query('DELETE FROM bookings');
        console.log('- bookings cleared');

        await pool.query('DELETE FROM transactions');
        console.log('- transactions cleared');

        await pool.query('DELETE FROM p2p_trades');
        console.log('- p2p_trades cleared');

        await pool.query('DELETE FROM p2p_ads');
        console.log('- p2p_ads cleared');

        await pool.query('DELETE FROM topup_requests');
        console.log('- topup_requests cleared');

        await pool.query('DELETE FROM wallets');
        console.log('- wallets cleared');

        await pool.query('DELETE FROM jobs');
        console.log('- jobs cleared');

        await pool.query('DELETE FROM expense_budgets');
        console.log('- expense_budgets cleared');

        await pool.query('DELETE FROM expenses');
        console.log('- expenses cleared');

        await pool.query('DELETE FROM provider_credentials');
        console.log('- provider_credentials cleared');

        await pool.query('DELETE FROM service_sessions');
        console.log('- service_sessions cleared');

        await pool.query('DELETE FROM service_availability');
        console.log('- service_availability cleared');

        await pool.query('DELETE FROM services');
        console.log('- services cleared');

        await pool.query('DELETE FROM admin_logs');
        console.log('- admin_logs cleared');

        await pool.query('DELETE FROM refresh_tokens');
        console.log('- refresh_tokens cleared');

        // Finally delete users except admin
        const deleteUsersRes = await pool.query('DELETE FROM users WHERE id != $1', [adminId]);
        console.log(`- Deleted ${deleteUsersRes.rowCount} users (except admin)`);

        console.log('--- Database Cleanup Completed Successfully ---');

    } catch (err) {
        console.error('Cleanup failed:', err);
    } finally {
        await mongoose.connection.close();
        await pool.end();
    }
}

cleanupDatabase();
