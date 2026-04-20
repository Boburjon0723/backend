import { Router } from 'express';
import { JobController } from '../controllers/job.controller';
import { authenticateToken } from '../../middleware/auth.middleware';
import { cacheMiddleware } from '../../middleware/cache.middleware';

const router = Router();
const jobController = new JobController();

// GET /api/jobs - Cache for 2 minutes
router.get('/', cacheMiddleware(120), jobController.getJobs);

// GET /api/jobs/categories - Cache for 10 minutes
router.get('/categories', cacheMiddleware(600), jobController.getCategories);

// POST /api/jobs (Protected)
router.post('/', authenticateToken, jobController.createJob);

// POST /api/jobs/categories
router.post('/categories', authenticateToken, jobController.createCategory);

export default router;
