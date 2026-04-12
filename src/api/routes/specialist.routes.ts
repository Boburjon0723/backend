import { Router } from 'express';
import * as SpecialistController from '../controllers/specialist.controller';
import { startOngoingConsult, getConsultChatFinancialPrep } from '../controllers/service.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

// Education Layer
router.post('/courses', authenticateToken, SpecialistController.createCourse);
router.post('/groups', authenticateToken, SpecialistController.createGroup);

// Teletherapy / Specialist Tools
router.post('/notes', authenticateToken, SpecialistController.saveNote);
router.post('/whiteboard/snapshot', authenticateToken, SpecialistController.saveWhiteboardSnapshot);
router.get('/whiteboard/:session_id/latest', authenticateToken, SpecialistController.getLatestWhiteboardSnapshot);

// Session Control
router.patch('/sessions/:id/close', authenticateToken, SpecialistController.closeSession);

/** Konsultatsiya: mijoz hisobi / sessiya summasi (qabul oldi tekshiruv) */
router.get('/consult/chat-financial-prep', authenticateToken, getConsultChatFinancialPrep);

/** Konsultatsiya: uchrashuvni boshlash (duplicate route — ba’zi deploylarda `/api/service/...` 404 bo‘lsa) */
router.post('/consult/start-ongoing', authenticateToken, startOngoingConsult);

export default router;

