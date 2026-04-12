import { pool } from '../../config/database';

export interface Service {
    id: string;
    provider_id: string;
    category: 'psychologist' | 'lawyer' | 'tutor' | 'job' | 'consultant' | 'other';
    title: string;
    description?: string;
    price_mali: number;
    duration_minutes: number;
    is_active: boolean;
    rating: number;
    total_bookings: number;
    created_at: Date;
    updated_at: Date;
}

export const ServiceModel = {
    async create(data: Partial<Service>): Promise<Service> {
        const query = `
      INSERT INTO services (
        provider_id, category, title, description, price_mali, duration_minutes
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
        const values = [
            data.provider_id,
            data.category,
            data.title,
            data.description,
            data.price_mali,
            data.duration_minutes
        ];
        const result = await pool.query(query, values);
        return result.rows[0];
    },

    async findById(id: string): Promise<Service | null> {
        const query = 'SELECT * FROM services WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    },

    async findAll(limit: number = 20, offset: number = 0): Promise<Service[]> {
        const query = 'SELECT * FROM services WHERE is_active = TRUE ORDER BY created_at DESC LIMIT $1 OFFSET $2';
        const result = await pool.query(query, [limit, offset]);
        return result.rows;
    }
};
