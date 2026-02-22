
import { pool } from '../config/database';

const createTransactionsTable = async () => {
    const query = `
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      sender_id UUID NOT NULL REFERENCES users(id),
      receiver_id UUID NOT NULL REFERENCES users(id),
      amount DECIMAL(10, 2) NOT NULL,
      fee DECIMAL(10, 2) DEFAULT 0,
      net_amount DECIMAL(10, 2) NOT NULL,
      currency VARCHAR(10) DEFAULT 'MALI',
      type VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL,
      note TEXT,
      metadata JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

    try {
        await pool.query(query);
        console.log('Transactions table created successfully');
    } catch (error) {
        console.error('Error creating transactions table:', error);
    } finally {
        pool.end();
    }
};

createTransactionsTable();
