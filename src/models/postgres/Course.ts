import { pool } from '../../config/database';

export interface Course {
    id: string;
    teacher_id: string;
    title: string;
    description?: string;
    subject?: string;
    level: 'beginner' | 'intermediate' | 'advanced';
    price_mali: number;
    max_students: number;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export const CourseModel = {
    async create(data: Partial<Course>): Promise<Course> {
        const query = `
            INSERT INTO courses (teacher_id, title, description, subject, level, price_mali, max_students)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `;
        const values = [
            data.teacher_id,
            data.title,
            data.description,
            data.subject,
            data.level,
            data.price_mali,
            data.max_students
        ];
        const result = await pool.query(query, values);
        return result.rows[0];
    },

    async findById(id: string): Promise<Course | null> {
        const query = 'SELECT * FROM courses WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    },

    async findByTeacher(teacherId: string): Promise<Course[]> {
        const query = 'SELECT * FROM courses WHERE teacher_id = $1 ORDER BY created_at DESC';
        const result = await pool.query(query, [teacherId]);
        return result.rows;
    }
};
