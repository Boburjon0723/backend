import { pool } from '../../config/database';

export interface SpecialistNote {
    id: string;
    specialist_id: string;
    client_id: string;
    booking_id?: string;
    content: string;
    is_private: boolean;
    created_at: Date;
    updated_at: Date;
}

export const SpecialistNoteModel = {
    async create(data: Partial<SpecialistNote>): Promise<SpecialistNote> {
        const query = `
            INSERT INTO specialist_notes (specialist_id, client_id, booking_id, content, is_private)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const values = [
            data.specialist_id,
            data.client_id,
            data.booking_id,
            data.content,
            data.is_private ?? true
        ];
        const result = await pool.query(query, values);
        return result.rows[0];
    },

    async findByClient(clientId: string, specialistId: string): Promise<SpecialistNote[]> {
        const query = `
            SELECT * FROM specialist_notes 
            WHERE client_id = $1 AND specialist_id = $2 
            ORDER BY created_at DESC
        `;
        const result = await pool.query(query, [clientId, specialistId]);
        return result.rows;
    }
};
