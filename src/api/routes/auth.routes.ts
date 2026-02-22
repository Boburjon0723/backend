import { Router } from 'express';
import { register, login } from '../controllers/auth.controller';

const router = Router();

router.post('/auth/register', register);
router.post('/auth/login', login);

export default router;
