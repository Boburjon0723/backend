
import { Router } from 'express';
import { JobController } from '../controllers/job.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();
const jobController = new JobController();

// GET /api/jobs
router.get('/', jobController.getJobs);

// GET /api/jobs/categories
router.get('/categories', jobController.getCategories);

// POST /api/jobs (Protected)
router.post('/', authenticateToken, jobController.createJob);

// POST /api/jobs/categories (Admin Protected ideally, keeping it simple for now)
router.post('/categories', authenticateToken, jobController.createCategory);

export default router;
