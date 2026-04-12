import { Request, Response } from 'express';
import { ExpertReviewModel } from '../../models/postgres/ExpertReview';

export const ReviewController = {
    async createReview(req: Request, res: Response) {
        try {
            const { expert_id, rating, comment } = req.body;
            const client_id = (req as any).user?.id;

            if (!expert_id || !rating) {
                return res.status(400).json({ message: 'Expert ID and rating are required' });
            }

            if (rating < 1 || rating > 5) {
                return res.status(400).json({ message: 'Rating must be between 1 and 5' });
            }

            const review = await ExpertReviewModel.create({
                expert_id,
                client_id,
                rating,
                comment: comment || ''
            });

            res.status(201).json(review);
        } catch (error) {
            console.error('Create review error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    },

    async getExpertReviews(req: Request, res: Response) {
        try {
            const { expert_id } = req.params;
            if (!expert_id) {
                return res.status(400).json({ message: 'Expert ID is required' });
            }

            const reviews = await ExpertReviewModel.getByExpertId(expert_id as string);
            const stats = await ExpertReviewModel.getStats(expert_id as string);

            res.json({ reviews, stats });
        } catch (error) {
            console.error('Get expert reviews error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
};
