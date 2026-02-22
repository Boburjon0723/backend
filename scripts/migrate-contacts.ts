import { pool } from '../src/config/database';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function migrateChatParticipantsToContacts() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mali_platform';
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) throw new Error('Mongo DB not found');

        const chats = await db.collection('chats').find({ type: 'private' }).toArray();
        console.log(`Found ${chats.length} private chats to migrate.`);

        for (const chat of chats) {
            const p = chat.participants;
            if (p && p.length === 2) {
                const u1 = p[0];
                const u2 = p[1];

                // Add u2 as contact of u1
                await pool.query(`
                    INSERT INTO user_contacts (user_id, contact_user_id)
                    VALUES ($1, $2)
                    ON CONFLICT (user_id, contact_user_id) DO NOTHING
                `, [u1, u2]);

                // Add u1 as contact of u2
                await pool.query(`
                    INSERT INTO user_contacts (user_id, contact_user_id)
                    VALUES ($1, $2)
                    ON CONFLICT (user_id, contact_user_id) DO NOTHING
                `, [u2, u1]);

                console.log(`Migrated contact between ${u1} and ${u2}`);
            }
        }

        console.log('Migration completed successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await mongoose.connection.close();
        await pool.end();
    }
}

migrateChatParticipantsToContacts();
