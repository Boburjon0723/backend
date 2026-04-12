import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function checkMongo() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mali_platform';
        await mongoose.connect(uri);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        if (!db) {
            throw new Error('Database connection not established');
        }

        const collections = await db.listCollections().toArray();
        console.log('--- MongoDB Collections ---');
        console.table(collections.map(c => ({ name: c.name })));

        for (const col of collections) {
            const count = await db.collection(col.name).countDocuments();
            console.log(`Collection: ${col.name}, Documents: ${count}`);

            // If it looks like contacts or users, show some data
            if (col.name.includes('contact') || col.name.includes('friend') || col.name.includes('user') || col.name.includes('chat')) {
                const data = await db.collection(col.name).find().limit(5).toArray();
                console.log(`Sample data for ${col.name}:`, JSON.stringify(data, null, 2));
            }
        }

    } catch (err) {
        console.error('Failed to check Mongo:', err);
    } finally {
        await mongoose.connection.close();
    }
}

checkMongo();
