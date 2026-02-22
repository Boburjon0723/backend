import { pool } from '../src/config/database';

async function migrate() {
    console.log('Starting migration: Creating expenses table...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            CREATE TABLE IF NOT EXISTS expenses (
                id SERIAL PRIMARY KEY,
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                amount DECIMAL(15,2) NOT NULL,
                category TEXT NOT NULL,
                description TEXT,
                type TEXT CHECK (type IN ('expense', 'income')) DEFAULT 'expense',
                date DATE DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query('COMMIT');
        console.log('Migration completed successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
    } finally {
        client.release();
        process.exit();
    }
}

migrate();
