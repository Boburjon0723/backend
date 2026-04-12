import { pool } from '../../config/database';

export interface CaseFolder {
    id: string;
    lawyer_id: string;
    client_id: string;
    title: string;
    status: 'open' | 'closed' | 'archived';
    metadata: any;
    created_at: Date;
    updated_at: Date;
}

export const CaseFolderModel = {
    async create(data: Partial<CaseFolder>): Promise<CaseFolder> {
        const query = `
            INSERT INTO case_folders (lawyer_id, client_id, title, status, metadata)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const values = [
            data.lawyer_id,
            data.client_id,
            data.title,
            data.status || 'open',
            JSON.stringify(data.metadata || {})
        ];
        const result = await pool.query(query, values);
        return result.rows[0];
    },

    async findByClient(clientId: string): Promise<CaseFolder[]> {
        const query = 'SELECT * FROM case_folders WHERE client_id = $1 ORDER BY updated_at DESC';
        const result = await pool.query(query, [clientId]);
        return result.rows;
    }
};
