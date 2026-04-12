
import { pool } from '../../config/database';

export interface JobCategory {
    id: number;
    name_uz: string;
    name_ru: string;
    icon: string;
    is_active: boolean;
    publication_price_mali: string;
    created_at: Date;
}

export class JobCategoryModel {
    async findAll(): Promise<JobCategory[]> {
        const query = 'SELECT * FROM job_categories WHERE is_active = TRUE ORDER BY id ASC';
        const result = await pool.query(query);
        return result.rows;
    }

    async create(category: Partial<JobCategory>): Promise<JobCategory> {
        const query = `
            INSERT INTO job_categories (name_uz, name_ru, icon, publication_price_mali)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const values = [category.name_uz, category.name_ru, category.icon, category.publication_price_mali];
        const result = await pool.query(query, values);
        return result.rows[0];
    }

    async update(id: number, data: Partial<JobCategory>): Promise<JobCategory | null> {
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        Object.entries(data).forEach(([key, val]) => {
            if (val !== undefined && key !== 'id') {
                fields.push(`${key} = $${idx++}`);
                values.push(val);
            }
        });

        if (fields.length === 0) return null;

        values.push(id);
        const query = `UPDATE job_categories SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
        const result = await pool.query(query, values);
        return result.rows[0];
    }
}
