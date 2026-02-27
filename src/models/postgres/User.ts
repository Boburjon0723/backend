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
    birthday?: Date;
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
    verified_status?: 'none' | 'pending' | 'approved' | 'rejected';
    specialization_details?: string;
    has_diploma?: boolean;
    institution?: string;
    current_workplace?: string;
    diploma_url?: string;
    certificate_url?: string;
    id_url?: string;
    selfie_url?: string;
    hourly_rate?: number;
    currency?: string;
    service_languages?: string;
    service_format?: string;
    bio_expert?: string;
    specialty_desc?: string;
    services_json?: string; // JSON string
    resume_url?: string;
    refresh_token?: string | null;
}

export const UserModel = {
    async findByPhone(phone: string): Promise<User | null> {
        console.log(`[DB] findByPhone: ${phone}`);
        const query = 'SELECT * FROM users WHERE phone = $1';
        try {
            const result = await pool.query(query, [phone]);
            console.log(`[DB] findByPhone result rows: ${result.rows.length}`);
            return result.rows[0] || null;
        } catch (err) {
            console.error(`[DB] findByPhone error:`, err);
            throw err;
        }
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
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Update Users Table (Basic fields)
            const userFields: string[] = [];
            const userValues: any[] = [];
            let uIdx = 1;

            const addUserField = (key: keyof User, dbCol?: string) => {
                if (data[key] !== undefined) {
                    userFields.push(`${dbCol || key} = $${uIdx++}`);
                    userValues.push(data[key]);
                }
            };

            addUserField('name');
            addUserField('surname');
            addUserField('age');
            addUserField('username');
            addUserField('email');
            addUserField('refresh_token', 'refresh_token');

            if (data.avatar_url !== undefined) {
                userFields.push(`avatar_url = $${uIdx++}`);
                userValues.push(data.avatar_url);
            } else if ((data as any).avatar !== undefined) {
                userFields.push(`avatar_url = $${uIdx++}`);
                userValues.push((data as any).avatar);
            }

            if (userFields.length > 0) {
                userValues.push(id);
                await client.query(`UPDATE users SET ${userFields.join(', ')} WHERE id = $${uIdx}`, userValues);
            }

            // 2. Update User Profiles Table (Expert fields)
            const profileFields: string[] = [];
            const profileValues: any[] = [];
            let pIdx = 1;

            const addProfileField = (key: keyof User, dbCol?: string) => {
                if (data[key] !== undefined) {
                    profileFields.push(`${dbCol || key} = $${pIdx++}`);
                    let value = data[key];
                    if (value === "" && (key === 'birthday' || key === 'experience_years' || key === 'service_price' || key === 'hourly_rate')) {
                        value = null;
                    }
                    profileValues.push(value);
                }
            };

            addProfileField('bio');
            addProfileField('birthday');
            addProfileField('is_expert');
            addProfileField('profession');
            addProfileField('specialization');
            addProfileField('experience_years');
            addProfileField('service_price');
            addProfileField('working_hours');
            addProfileField('languages');
            // handled below
            addProfileField('specialization_details');
            addProfileField('has_diploma');
            addProfileField('institution');
            addProfileField('current_workplace');
            addProfileField('diploma_url');
            addProfileField('certificate_url');
            addProfileField('id_url');
            addProfileField('selfie_url');
            addProfileField('hourly_rate');
            addProfileField('currency');
            addProfileField('service_languages');
            addProfileField('service_format');
            addProfileField('bio_expert');
            addProfileField('specialty_desc');
            addProfileField('services_json');
            addProfileField('resume_url');

            // Handle re-verification logic if expert fields changed (consistent with controller)
            if (data.is_expert === true || data.profession || data.specialization || data.hourly_rate) {
                // We need to know current status to decide if we reset to pending
                const currentStatusRes = await client.query('SELECT verified_status FROM user_profiles WHERE user_id = $1', [id]);
                const currentStatus = currentStatusRes.rows[0]?.verified_status;

                if (currentStatus === 'none' || currentStatus === 'unverified' || currentStatus === 'rejected') {
                    // Force to pending if not explicitly provided
                    if (data.verified_status === undefined) {
                        data.verified_status = 'pending';
                    }
                }
            }

            // Now add it safely - only one assignment will happen
            addProfileField('verified_status');

            if (profileFields.length > 0) {
                // Ensure profile exists
                const profileExists = await client.query('SELECT 1 FROM user_profiles WHERE user_id = $1', [id]);
                if (profileExists.rows.length === 0) {
                    await client.query('INSERT INTO user_profiles (user_id) VALUES ($1)', [id]);
                }

                profileValues.push(id);
                await client.query(`UPDATE user_profiles SET ${profileFields.join(', ')} WHERE user_id = $${pIdx}`, profileValues);
            }

            await client.query('COMMIT');

            // Return full joined user object
            const result = await client.query(`
                SELECT u.*, p.* 
                FROM users u 
                LEFT JOIN user_profiles p ON u.id = p.user_id 
                WHERE u.id = $1
            `, [id]);

            return result.rows[0] || null;

        } catch (e) {
            await client.query('ROLLBACK');
            console.error("UserModel Update Error:", e);
            throw e;
        } finally {
            client.release();
        }
    },

    async findAll(): Promise<User[]> {
        const query = 'SELECT id, phone, name, surname, role, created_at FROM users LIMIT 50';
        const result = await pool.query(query);
        return result.rows;
    },

    async isBlocked(user1: string, user2: string): Promise<boolean> {
        const query = `
            SELECT 1 FROM user_blocks 
            WHERE (blocker_id = $1 AND blocked_id = $2) 
               OR (blocker_id = $2 AND blocked_id = $1)
        `;
        const result = await pool.query(query, [user1, user2]);
        return result.rows.length > 0;
    }
};
