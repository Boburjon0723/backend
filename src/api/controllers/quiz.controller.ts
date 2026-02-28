import { Request, Response } from 'express';
import { QuizModel } from '../../models/postgres/Quiz';

export const createQuiz = async (req: Request, res: Response): Promise<void> => {
    try {
        const sessionId = req.params.sessionId as string;
        const { title, questions } = req.body;
        // @ts-ignore
        const mentorId = req.user.id;

        if (!title || !questions || !Array.isArray(questions)) {
            res.status(400).json({ message: 'Invalid quiz payload' });
            return;
        }

        // 1. Create Core Quiz
        const newQuiz = await QuizModel.create(sessionId as string, mentorId, title);

        // 2. Add Questions & Options
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            const addedQuestion = await QuizModel.addQuestion(newQuiz.id, q.text, q.type || 'multiple_choice', i);

            if (q.options && Array.isArray(q.options)) {
                for (let j = 0; j < q.options.length; j++) {
                    const opt = q.options[j];
                    await QuizModel.addOption(addedQuestion.id, opt.text, opt.isCorrect || false, j);
                }
            }
        }

        res.status(201).json({ message: 'Quiz created successfully', quizId: newQuiz.id });
    } catch (error) {
        console.error('Error creating quiz:', error);
        res.status(500).json({ message: 'Failed to create quiz' });
    }
};

export const getSessionQuizzes = async (req: Request, res: Response): Promise<void> => {
    try {
        const sessionId = req.params.sessionId as string;
        const quizzes = await QuizModel.getSessionQuizzes(sessionId);

        // Populate full details for active quizzes (optional optimization: only fetch on demand)
        const fullQuizzes = await Promise.all(quizzes.map(async (q: any) => {
            return await QuizModel.getFullQuiz(q.id);
        }));

        res.status(200).json(fullQuizzes);
    } catch (error) {
        console.error('Error fetching quizzes:', error);
        res.status(500).json({ message: 'Failed to fetch quizzes' });
    }
};

export const getSingleQuiz = async (req: Request, res: Response): Promise<void> => {
    try {
        const quizId = req.params.quizId as string;
        const fullQuiz = await QuizModel.getFullQuiz(quizId);

        if (!fullQuiz) {
            res.status(404).json({ message: 'Quiz not found' });
            return;
        }

        // Prevent leaking correct answers unless it's the mentor (logic goes here)
        // @ts-ignore
        const isMentor = req.user.id === fullQuiz.mentor_id;

        if (!isMentor) {
            fullQuiz.questions.forEach((q: any) => {
                q.options.forEach((opt: any) => {
                    delete opt.is_correct; // Strip answer key for students
                });
            });
        }

        res.status(200).json(fullQuiz);
    } catch (error) {
        console.error('Error fetching quiz details:', error);
        res.status(500).json({ message: 'Failed to fetch quiz details' });
    }
};

export const saveQuizResult = async (req: Request, res: Response): Promise<void> => {
    try {
        const quizId = req.params.quizId as string;
        const { score, totalQuestions } = req.body;
        // @ts-ignore
        const studentId = req.user.id;

        const result = await QuizModel.saveResult(quizId, studentId, score, totalQuestions);
        res.status(200).json(result);
    } catch (error) {
        console.error('Error saving quiz result:', error);
        res.status(500).json({ message: 'Failed to save result' });
    }
};
