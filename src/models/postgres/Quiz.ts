import { pool } from '../../config/database';

export class QuizModel {

    // 1. Create a master Quiz record for a session
    static async create(sessionId: string, mentorId: string, title: string) {
        const query = `
            INSERT INTO quizzes (session_id, mentor_id, title)
            VALUES ($1, $2, $3)
            RETURNING *;
        `;
        const result = await pool.query(query, [sessionId, mentorId, title]);
        return result.rows[0];
    }

    // 2. Add a question to a quiz
    static async addQuestion(quizId: string, questionText: string, type: string = 'multiple_choice', orderIndex: number = 0) {
        const query = `
            INSERT INTO quiz_questions (quiz_id, question_text, question_type, order_index)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const result = await pool.query(query, [quizId, questionText, type, orderIndex]);
        return result.rows[0];
    }

    // 3. Add an option to a specific question
    static async addOption(questionId: string, optionText: string, isCorrect: boolean, orderIndex: number = 0) {
        const query = `
            INSERT INTO quiz_options (question_id, option_text, is_correct, order_index)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const result = await pool.query(query, [questionId, optionText, isCorrect, orderIndex]);
        return result.rows[0];
    }

    // 4. Fetch the full quiz with questions and their options (for participants)
    static async getFullQuiz(quizId: string) {
        // Fetch base quiz
        const quizQuery = `SELECT * FROM quizzes WHERE id = $1`;
        const quizRes = await pool.query(quizQuery, [quizId]);
        if (quizRes.rows.length === 0) return null;
        const quiz = quizRes.rows[0];

        // Fetch questions
        const questionsQuery = `SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY order_index ASC`;
        const questionsRes = await pool.query(questionsQuery, [quizId]);
        quiz.questions = questionsRes.rows;

        // Fetch options for all questions
        for (let q of quiz.questions) {
            const optionsQuery = `
                SELECT id, question_id, option_text, is_correct, order_index 
                FROM quiz_options 
                WHERE question_id = $1 
                ORDER BY order_index ASC
            `;
            const optionsRes = await pool.query(optionsQuery, [q.id]);
            q.options = optionsRes.rows;
        }

        return quiz;
    }

    // 5. Save Student Result
    static async saveResult(quizId: string, studentId: string, score: number, totalQuestions: number) {
        const query = `
            INSERT INTO quiz_results (quiz_id, student_id, score, total_questions)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (quiz_id, student_id)
            DO UPDATE SET score = $3, total_questions = $4, completed_at = CURRENT_TIMESTAMP
            RETURNING *;
        `;
        const result = await pool.query(query, [quizId, studentId, score, totalQuestions]);
        return result.rows[0];
    }

    // 6. Get all quizzes for a session
    static async getSessionQuizzes(sessionId: string) {
        const query = `SELECT * FROM quizzes WHERE session_id = $1 ORDER BY created_at DESC`;
        const result = await pool.query(query, [sessionId]);
        return result.rows;
    }
}
