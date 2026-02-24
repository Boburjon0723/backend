process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';
import dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
    dotenv.config({ override: true });
}

// PostgreSQL Connection
console.log('Database URL check:', process.env.DATABASE_URL ? 'URL exists' : 'URL MISSING');
const isProduction = process.env.NODE_ENV === 'production';
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
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

const query = (text: string, params?: any) => pool.query(text, params);

export { pool, query };
