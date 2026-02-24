import { pool } from '../../config/database';

export interface Transaction {
  id: string;
  sender_id: string | null;
  receiver_id: string | null;
  amount: number;
  fee: number;
  net_amount: number;
  type: 'transfer' | 'service_payment' | 'escrow_hold' | 'escrow_release' | 'refund' | 'commission' | 'deposit' | 'withdrawal';
  status: 'pending' | 'completed' | 'failed' | 'reversed';
  reference_type?: string;
  reference_id?: string;
  note?: string;
  metadata?: any;
  created_at: Date;
}

export const TransactionModel = {
  async create(client: any, data: Partial<Transaction>): Promise<Transaction> {
    const query = `
      INSERT INTO transactions (
        sender_id, receiver_id, amount, fee, net_amount, type, status, note, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const values = [
      data.sender_id,
      data.receiver_id,
      data.amount,
      data.fee,
      data.net_amount,
      data.type,
      data.status,
      data.note,
      data.metadata
    ];

    // Use the provided client (for transaction scope) or global pool
    const db = client || pool;
    const result = await db.query(query, values);
    return result.rows[0];
  },

  async findByUserId(userId: string, limit: number = 20, offset: number = 0): Promise<Transaction[]> {
    const query = `
      SELECT * FROM transactions 
      WHERE sender_id = $1 OR receiver_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    const result = await pool.query(query, [userId, limit, offset]);
    return result.rows;
  }
};
