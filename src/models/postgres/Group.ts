import { pool } from '../../config/database';

export interface Group {
    id: string;
    course_id: string;
    name: string;
    schedule_time: Date;
    max_students: number;
    livekit_room_id?: string;
    created_at: Date;
    updated_at: Date;
}

export const GroupModel = {
    async create(data: Partial<Group>): Promise<Group> {
        const query = `
            INSERT INTO groups (course_id, name, schedule_time, max_students)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const values = [
            data.course_id,
            data.name,
            data.schedule_time,
            data.max_students
        ];
        const result = await pool.query(query, values);
        return result.rows[0];
    },

    async findByCourse(courseId: string): Promise<Group[]> {
        const query = 'SELECT * FROM groups WHERE course_id = $1 ORDER BY schedule_time ASC';
        const result = await pool.query(query, [courseId]);
        return result.rows;
    },

    async addMember(groupId: string, userId: string): Promise<void> {
        const query = 'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING';
        await pool.query(query, [groupId, userId]);
    }
};
