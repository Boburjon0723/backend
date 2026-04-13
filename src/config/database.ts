process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

if (process.env.NODE_ENV !== 'production') {
    dotenv.config({ override: true });
}

// PostgreSQL Connection
const isProduction = process.env.NODE_ENV === 'production';
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 30000, // Increase to 30s
    idleTimeoutMillis: 30000,
    max: 20, // Increase pool size
});

// Test connection immediately
(async () => {
    try {
        const client = await pool.connect();
        if (!isProduction) {
            console.log('Successfully connected to PostgreSQL database (Test Query)');
        }
        client.release();
    } catch (err) {
        console.error('FAILED to connect to PostgreSQL database:', err);
    }
})();

pool.on('connect', () => {
    // console.log('PostgreSQL client connected');
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client (will handle automatically):', err);
    // Do NOT exit the process. The pool will handle creating new connections.
});

const query = (text: string, params?: any) => pool.query(text, params);

export { pool, query };
