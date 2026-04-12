import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware';
import { createQuiz, getSessionQuizzes, getSingleQuiz, saveQuizResult, deleteQuiz } from '../controllers/quiz.controller';

const router = Router();

// Sessions endpoints
router.post('/sessions/:sessionId/quizzes', authenticateToken, createQuiz);
router.get('/sessions/:sessionId/quizzes', authenticateToken, getSessionQuizzes);

// Direct Quiz endpoints
router.get('/quizzes/:quizId', authenticateToken, getSingleQuiz);
router.delete('/quizzes/:quizId', authenticateToken, deleteQuiz);
router.post('/quizzes/:quizId/results', authenticateToken, saveQuizResult);

export default router;
