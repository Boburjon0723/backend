import { pool } from '../../config/database';

export interface SpecialistNote {
    id: string;
    specialist_id: string;
    client_id: string | null;
    booking_id?: string;
    content: string;
    is_private: boolean;
    shared_with_client: boolean;
    created_at: Date;
    updated_at: Date;
    note_type?: 'client' | 'session';
}

export const SpecialistNoteModel = {
    async create(data: Partial<SpecialistNote>): Promise<SpecialistNote> {
        const noteType = data.note_type || 'client';
        const hasNoteTypeCol = await pool.query(
            `SELECT 1 FROM information_schema.columns WHERE table_name = 'specialist_notes' AND column_name = 'note_type'`
        ).then(r => (r.rowCount ?? 0) > 0);
        const cols = hasNoteTypeCol
            ? 'specialist_id, client_id, booking_id, content, is_private, shared_with_client, note_type'
            : 'specialist_id, client_id, booking_id, content, is_private, shared_with_client';
        const placeholders = hasNoteTypeCol ? '$1, $2, $3, $4, $5, $6, $7' : '$1, $2, $3, $4, $5, $6';
        const values: any[] = [
            data.specialist_id,
            data.client_id ?? null,
            data.booking_id ?? null,
            data.content,
            data.is_private ?? true,
            data.shared_with_client ?? false
        ];
        if (hasNoteTypeCol) values.push(noteType);
        const query = `INSERT INTO specialist_notes (${cols}) VALUES (${placeholders}) RETURNING *`;
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
    },

    async findBySession(specialistId: string): Promise<SpecialistNote[]> {
        const query = `
            SELECT * FROM specialist_notes 
            WHERE specialist_id = $1 AND client_id IS NULL
            ORDER BY created_at DESC
        `;
        const result = await pool.query(query, [specialistId]);
        return result.rows;
    }
};
