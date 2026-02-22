
import { pool } from '../../config/database';

export interface Job {
    id: string;
    user_id: string;
    title: string;
    description: string;
    price: string;
    category: string;
    type: 'online' | 'offline';
    status: 'active' | 'closed' | 'draft';
    contact_phone?: string;
    created_at: Date;
    user?: {
        name: string;
        phone: string;
    };
}

export class JobModel {

    async create(job: Partial<Job>): Promise<Job> {
        const query = `
            INSERT INTO jobs (user_id, title, description, price, category, type, status, contact_phone)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;
        const values = [
            job.user_id,
            job.title,
            job.description,
            job.price,
            job.category,
            job.type,
            job.status || 'active',
            job.contact_phone
        ];

        try {
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            console.error('Job creation db error:', error);
            throw error;
        }
    }

    async findAll(filters: { type?: string; category?: string }): Promise<Job[]> {
        let query = `
            SELECT j.*, u.name as user_name, u.phone as user_phone
            FROM jobs j
            LEFT JOIN users u ON j.user_id = u.id
            WHERE 1=1
        `;
        const values: any[] = [];
        let paramIndex = 1;

        if (filters.type && filters.type !== 'all') {
            query += ` AND j.type = $${paramIndex}`;
            values.push(filters.type);
            paramIndex++;
        }

        if (filters.category && filters.category !== 'all') {
            query += ` AND j.category = $${paramIndex}`;
            values.push(filters.category);
            paramIndex++;
        }

        query += ` ORDER BY j.created_at DESC`;

        const result = await pool.query(query, values);

        // Map result to include user object
        return result.rows.map(row => ({
            ...row,
            user: {
                name: row.user_name || 'Unknown',
                phone: row.user_phone || ''
            }
        }));
    }

    async findById(id: string): Promise<Job | null> {
        const query = `SELECT * FROM jobs WHERE id = $1`;
        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    }
}
