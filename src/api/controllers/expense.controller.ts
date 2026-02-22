import { Request, Response } from 'express';
import { pool } from '../../config/database';

export const addExpense = async (req: Request, res: Response) => {
    // @ts-ignore
    const userId = req.user.id;
    const { amount, category, description, type, date } = req.body;

    if (!amount || !category || !type) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO expenses (user_id, amount, category, description, type, date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [userId, amount, category, description, type, date || new Date().toISOString().split('T')[0]]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Add Expense Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getExpenses = async (req: Request, res: Response) => {
    // @ts-ignore
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    try {
        let query = 'SELECT * FROM expenses WHERE user_id = $1';
        const params: any[] = [userId];

        if (startDate && endDate) {
            query += ' AND date BETWEEN $2 AND $3';
            params.push(startDate, endDate);
        }

        query += ' ORDER BY date DESC, created_at DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get Expenses Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getExpenseStats = async (req: Request, res: Response) => {
    // @ts-ignore
    const userId = req.user.id;

    try {
        const stats = await pool.query(
            'SELECT category, type, SUM(amount) as total_amount, COUNT(*) as count FROM expenses WHERE user_id = $1 GROUP BY category, type',
            [userId]
        );

        const totals = await pool.query(
            'SELECT type, SUM(amount) as total FROM expenses WHERE user_id = $1 GROUP BY type',
            [userId]
        );

        res.json({
            categories: stats.rows,
            totals: totals.rows
        });
    } catch (error) {
        console.error('Get Expense Stats Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteExpense = async (req: Request, res: Response) => {
    // @ts-ignore
    const userId = req.user.id;
    const { id } = req.params;

    try {
        const result = await pool.query(
            'DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING *',
            [id, userId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Expense not found' });
        }

        res.json({ message: 'Deleted successfully' });
    } catch (error) {
        console.error('Delete Expense Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
