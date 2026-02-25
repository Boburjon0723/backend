import { Request, Response } from 'express';
import { JobModel } from '../../models/postgres/Job';
import { JobCategoryModel } from '../../models/postgres/JobCategory';
import { pool } from '../../config/database';

export class JobController {
    private jobModel: JobModel;
    private categoryModel: JobCategoryModel;

    constructor() {
        this.jobModel = new JobModel();
        this.categoryModel = new JobCategoryModel();
    }

    createJob = async (req: Request, res: Response) => {
        const client = await pool.connect();
        try {
            const userId = (req as any).user.id;
            const jobData = req.body;

            if (!jobData.sub_type || !jobData.category_id || !jobData.type) {
                return res.status(400).json({ message: 'Missing required fields' });
            }

            await client.query('BEGIN');

            // 1. Get Category Price
            const catRes = await client.query('SELECT publication_price_mali FROM job_categories WHERE id = $1', [jobData.category_id]);
            if (catRes.rows.length === 0) {
                throw new Error('Category not found');
            }
            const price = parseFloat(catRes.rows[0].publication_price_mali);

            if (price > 0) {
                // 2. Check and Lock balance
                const balRes = await client.query('SELECT balance FROM token_balances WHERE user_id = $1 FOR UPDATE', [userId]);
                if (balRes.rows.length === 0) throw new Error('Wallet not initialized');

                const balance = parseFloat(balRes.rows[0].balance);
                if (balance < price) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ message: 'Mablag\' yetarli emas. Balansingizni to\'ldiring.' });
                }

                // 3. Deduct balance
                await client.query('UPDATE token_balances SET balance = balance - $1, lifetime_spent = lifetime_spent + $1, updated_at = NOW() WHERE user_id = $2', [price, userId]);

                // 4. Record Transaction
                await client.query(`
                    INSERT INTO transactions (sender_id, amount, net_amount, type, status, note)
                    VALUES ($1, $2, $2, 'service_payment', 'completed', $3)
                `, [userId, price, `Job posting fee for category ${jobData.category_id}`]);
            }

            // 5. Create Job
            const job = await this.jobModel.create({
                ...jobData,
                user_id: userId,
                payment_status: price > 0 ? 'paid' : 'free',
                publication_fee: price
            }, client);

            await client.query('COMMIT');
            res.status(201).json(job);
        } catch (error: any) {
            await client.query('ROLLBACK');
            console.error('Create Job Error:', error);
            res.status(500).json({ message: error.message || 'Internal server error' });
        } finally {
            client.release();
        }
    };

    getJobs = async (req: Request, res: Response) => {
        try {
            const { type, category_id, sub_type } = req.query;
            const jobs = await this.jobModel.findAll({
                type: type as string,
                category_id: category_id ? parseInt(category_id as string) : undefined,
                sub_type: sub_type as string
            });
            res.json(jobs);
        } catch (error) {
            console.error('Get Jobs Error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };

    getCategories = async (req: Request, res: Response) => {
        try {
            const categories = await this.categoryModel.findAll();
            res.json(categories);
        } catch (error) {
            console.error('Get Categories Error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };

    createCategory = async (req: Request, res: Response) => {
        try {
            const { name_uz, name_ru, icon, publication_price_mali } = req.body;
            const category = await this.categoryModel.create({ name_uz, name_ru, icon, publication_price_mali });
            res.status(201).json(category);
        } catch (error) {
            console.error('Create Category Error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
}
