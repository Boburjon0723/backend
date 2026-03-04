import { pool } from '../../config/database';

export interface ExpertReview {
    id: string;
    expert_id: string;
    client_id: string;
    rating: number;
    comment: string;
    created_at: Date;
    client_name?: string;
    client_avatar?: string;
}

export const ExpertReviewModel = {
    async create(data: { expert_id: string, client_id: string, rating: number, comment: string }): Promise<ExpertReview> {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const query = `
                INSERT INTO expert_reviews (expert_id, client_id, rating, comment)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            `;
            const result = await client.query(query, [data.expert_id, data.client_id, data.rating, data.comment]);
            const review = result.rows[0];

            // Update average rating in user_profiles
            const updateRatingQuery = `
                UPDATE user_profiles 
                SET rating = (
                    SELECT AVG(rating) 
                    FROM expert_reviews 
                    WHERE expert_id = $1
                )
                WHERE user_id = $1
            `;
            await client.query(updateRatingQuery, [data.expert_id]);

            await client.query('COMMIT');
            return review;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    },

    async getByExpertId(expertId: string): Promise<ExpertReview[]> {
        const query = `
            SELECT r.*, u.name as client_name, u.avatar_url as client_avatar
            FROM expert_reviews r
            JOIN users u ON r.client_id = u.id
            WHERE r.expert_id = $1
            ORDER BY r.created_at DESC
        `;
        const result = await pool.query(query, [expertId]);
        return result.rows;
    },

    async getStats(expertId: string): Promise<{ average: number, count: number }> {
        const query = `
            SELECT AVG(rating) as average, COUNT(*) as count
            FROM expert_reviews
            WHERE expert_id = $1
        `;
        const result = await pool.query(query, [expertId]);
        return {
            average: parseFloat(result.rows[0].average) || 0,
            count: parseInt(result.rows[0].count) || 0
        };
    }
};
