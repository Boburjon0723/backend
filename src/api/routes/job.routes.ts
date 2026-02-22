
import { Router } from 'express';
import { JobController } from '../controllers/job.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();
const jobController = new JobController();

// GET /api/jobs
router.get('/', jobController.getJobs);

// POST /api/jobs (Protected)
router.post('/', authenticateToken, jobController.createJob);

export default router;
