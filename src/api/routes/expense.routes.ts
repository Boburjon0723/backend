import { Router } from 'express';
import { addExpense, getExpenses, getExpenseStats, deleteExpense } from '../controllers/expense.controller';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.post('/', authenticateToken, addExpense);
router.get('/', authenticateToken, getExpenses);
router.get('/stats', authenticateToken, getExpenseStats);
router.delete('/:id', authenticateToken, deleteExpense);

export default router;
