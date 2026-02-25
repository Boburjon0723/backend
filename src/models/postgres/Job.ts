
import { pool } from '../../config/database';

export interface Job {
    id: string;
    user_id: string;
    sub_type: 'seeker' | 'employer';
    category_id: number;
    type: 'online' | 'offline';
    status: 'active' | 'closed' | 'draft';
    payment_status: 'unpaid' | 'paid';
    publication_fee: string;
    short_text: string;
    created_at: Date;

    // Seeker specific fields
    full_name?: string;
    birth_date?: Date;
    location?: string;
    experience_years?: number;
    salary_min?: string;
    is_salary_negotiable?: boolean;
    skills_json?: any;
    has_diploma?: boolean;
    has_certificate?: boolean;
    resume_url?: string;

    // Employer specific fields
    company_name?: string;
    responsible_person?: string;
    work_type?: string;
    work_hours?: string;
    day_off?: string;
    age_range?: string;
    gender_pref?: string;
    requirements_json?: any;
    salary_text?: string;
    benefits_json?: any;
    apply_method_json?: any;

    user?: {
        name: string;
        phone: string;
    };
    category_name_uz?: string;
    category_icon?: string;
}

export class JobModel {

    async create(job: Partial<Job>): Promise<Job> {
        const query = `
            INSERT INTO jobs (
                user_id, sub_type, category_id, type, status, short_text, 
                full_name, birth_date, location, experience_years, salary_min, is_salary_negotiable, skills_json, has_diploma, has_certificate, resume_url,
                company_name, responsible_person, work_type, work_hours, day_off, age_range, gender_pref, requirements_json, salary_text, benefits_json, apply_method_json,
                payment_status, publication_fee
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
            RETURNING *
        `;
        const values = [
            job.user_id, job.sub_type, job.category_id, job.type, job.status || 'active', job.short_text,
            job.full_name, job.birth_date, job.location, job.experience_years, job.salary_min, job.is_salary_negotiable, job.skills_json, job.has_diploma, job.has_certificate, job.resume_url,
            job.company_name, job.responsible_person, job.work_type, job.work_hours, job.day_off, job.age_range, job.gender_pref, job.requirements_json, job.salary_text, job.benefits_json, job.apply_method_json,
            job.payment_status || 'unpaid', job.publication_fee || 0
        ];

        try {
            const result = await pool.query(query, values);
            return result.rows[0];
        } catch (error) {
            console.error('Job creation db error:', error);
            throw error;
        }
    }

    async findAll(filters: { type?: string; category_id?: number; sub_type?: string }): Promise<Job[]> {
        let query = `
            SELECT j.*, u.name as user_name, u.phone as user_phone, c.name_uz as category_name_uz, c.icon as category_icon
            FROM jobs j
            LEFT JOIN users u ON j.user_id = u.id
            LEFT JOIN job_categories c ON j.category_id = c.id
            WHERE 1=1
        `;
        const values: any[] = [];
        let paramIndex = 1;

        if (filters.type && filters.type !== 'all') {
            query += ` AND j.type = $${paramIndex}`;
            values.push(filters.type);
            paramIndex++;
        }

        if (filters.category_id) {
            query += ` AND j.category_id = $${paramIndex}`;
            values.push(filters.category_id);
            paramIndex++;
        }

        if (filters.sub_type) {
            query += ` AND j.sub_type = $${paramIndex}`;
            values.push(filters.sub_type);
            paramIndex++;
        }

        query += ` ORDER BY j.created_at DESC`;

        const result = await pool.query(query, values);

        return result.rows.map(row => ({
            ...row,
            category_name: row.category_name_uz,
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
