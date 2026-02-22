
import { Request, Response } from 'express';
import { JobModel } from '../../models/postgres/Job';

export class JobController {
    private jobModel: JobModel;

    constructor() {
        this.jobModel = new JobModel();
    }

    createJob = async (req: Request, res: Response) => {
        try {
            const userId = (req as any).user.id; // From Auth Middleware
            const { title, description, price, category, type, contact_phone } = req.body;

            if (!title || !description || !category || !type) {
                return res.status(400).json({ message: 'Missing required fields' });
            }

            const job = await this.jobModel.create({
                user_id: userId,
                title,
                description,
                price,
                category,
                type,
                contact_phone
            });

            res.status(201).json(job);
        } catch (error) {
            console.error('Create Job Error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };

    getJobs = async (req: Request, res: Response) => {
        try {
            const { type, category } = req.query;
            const jobs = await this.jobModel.findAll({
                type: type as string,
                category: category as string
            });
            res.json(jobs);
        } catch (error) {
            console.error('Get Jobs Error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
}
