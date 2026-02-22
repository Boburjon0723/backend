import { Pool } from 'pg';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
    dotenv.config({ override: true });
}

// PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('supabase') || process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false
});

// Test connection immediately
(async () => {
    try {
        const client = await pool.connect();
        console.log('Successfully connected to PostgreSQL database (Test Query)');
        client.release();
    } catch (err) {
        console.error('FAILED to connect to PostgreSQL database:', err);
    }
})();

pool.on('connect', () => {
    console.log('PostgreSQL client connected');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
    process.exit(-1);
});

// MongoDB Connection
const connectMongoDB = async () => {
    try {
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mali_platform';
        console.log('Attempting to connect to MongoDB with URI:', mongoURI.replace(/:([^:@]+)@/, ':****@'));
        await mongoose.connect(mongoURI);
        console.log('Connected to MongoDB database');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

const query = (text: string, params?: any) => pool.query(text, params);

export { pool, query, connectMongoDB };
