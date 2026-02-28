import { pool } from '../src/config/database';

async function up() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('Starting migration for Quizzes...');

        // 1. Quizzes Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS quizzes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                mentor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Created quizzes table.');

        // 2. Quiz Questions Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS quiz_questions (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
                question_text TEXT NOT NULL,
                question_type VARCHAR(50) DEFAULT 'multiple_choice' CHECK (question_type IN ('multiple_choice', 'true_false', 'open_ended')),
                order_index INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Created quiz_questions table.');

        // 3. Quiz Options Table
        await client.query(`
            CREATE TABLE IF NOT EXISTS quiz_options (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                question_id UUID NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
                option_text TEXT NOT NULL,
                is_correct BOOLEAN DEFAULT false,
                order_index INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('Created quiz_options table.');

        // 4. Quiz Results (Student Answers)
        await client.query(`
            CREATE TABLE IF NOT EXISTS quiz_results (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
                student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                score INTEGER DEFAULT 0,
                total_questions INTEGER DEFAULT 0,
                completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(quiz_id, student_id)
            );
        `);
        console.log('Created quiz_results table.');

        await client.query('COMMIT');
        console.log('Migration successful.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', error);
    } finally {
        client.release();
        process.exit();
    }
}

up();
