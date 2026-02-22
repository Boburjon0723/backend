import { pool } from '../../config/database';

export interface User {
    id: string;
    phone: string;
    password_hash: string;
    name: string;
    surname: string;
    age: number;
    role: string;
    created_at: Date;
    avatar_url: string | null;
    email: string | null;
    username?: string;
    bio?: string;
    // Expert fields
    region?: string;
    is_expert?: boolean;
    profession?: string;
    specialization?: string; // JSON string or comma separated
    experience_years?: number;
    service_price?: number;
    working_hours?: string;
    languages?: string; // JSON string or comma separated
    rating?: number;
    is_verified?: boolean;
}

export const UserModel = {
    async findByPhone(phone: string): Promise<User | null> {
        const query = 'SELECT * FROM users WHERE phone = $1';
        const result = await pool.query(query, [phone]);
        return result.rows[0] || null;
    },

    async create(phone: string, passwordHash: string, name: string, surname: string, age: number): Promise<User> {
        const query = `
      INSERT INTO users (phone, password_hash, name, surname, age)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
        const result = await pool.query(query, [phone, passwordHash, name, surname, age]);
        return result.rows[0];
    },

    async findById(id: string): Promise<User | null> {
        const query = 'SELECT * FROM users WHERE id = $1';
        const result = await pool.query(query, [id]);
        return result.rows[0] || null;
    },

    async update(id: string, data: Partial<User>): Promise<User | null> {
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;

        // Helper to add field if exists
        const addField = (key: keyof User, dbCol?: string) => {
            if (data[key] !== undefined) {
                fields.push(`${dbCol || key} = $${idx++}`);
                values.push(data[key]);
            }
        };

        addField('name');
        addField('surname');
        addField('age');
        addField('username');
        addField('bio');

        // Map 'avatar' from input to 'avatar_url' in DB
        if ((data as any).avatar) {
            fields.push(`avatar_url = $${idx++}`);
            values.push((data as any).avatar);
        } else {
            addField('avatar_url');
        }

        // Expert fields
        addField('region');
        addField('is_expert');
        addField('profession');
        addField('specialization');
        addField('experience_years');
        addField('service_price');
        addField('working_hours');
        addField('languages');
        addField('rating');
        addField('is_verified');

        if (fields.length === 0) return null;

        values.push(id);
        const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;

        try {
            const result = await pool.query(query, values);
            return result.rows[0] || null;
        } catch (e) {
            console.error("DB Update Error:", e);
            throw e;
        }
    },

    async findAll(): Promise<User[]> {
        const query = 'SELECT id, phone, name, surname, role, created_at FROM users LIMIT 50';
        const result = await pool.query(query);
        return result.rows;
    }
};
