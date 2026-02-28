import { Router } from 'express';
import * as SpecialistController from '../controllers/specialist.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

// Education Layer
router.post('/courses', authenticateToken, SpecialistController.createCourse);
router.post('/groups', authenticateToken, SpecialistController.createGroup);

// Teletherapy Layer
router.post('/notes', authenticateToken, SpecialistController.saveNote);

// Consultation Layer
router.post('/case-folders', authenticateToken, SpecialistController.createCaseFolder);

export default router;
