import app from './app';
import http from 'http';
import { Server } from 'socket.io';
import { SocketService } from './socket/socket.service';
import dotenv from 'dotenv';
import { pool } from './config/database';

import { globalLimiter } from './middleware/rateLimit.middleware';

dotenv.config();

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

// Global Rate Limiting
app.use(globalLimiter);

// Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    // Allow both polling and websocket transports (Railway compatibility)
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
});

// Attach io to app for access in controllers
app.set('io', io);

new SocketService(io);

const runAutoMigration = async () => {
    try {
        console.log('Running auto-migration...');
        const sql = `
            DO $$ 
            BEGIN 
                BEGIN ALTER TABLE user_profiles ADD COLUMN specialization_details TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN has_diploma BOOLEAN DEFAULT FALSE; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN institution VARCHAR(255); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN current_workplace VARCHAR(255); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN diploma_url TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN certificate_url TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN id_url TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN selfie_url TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN resume_url TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN hourly_rate DECIMAL(20, 4) DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN currency VARCHAR(10) DEFAULT 'MALI'; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN service_languages TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN service_format VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN bio_expert TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN specialty_desc TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE user_profiles ADD COLUMN services_json JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END;

                -- Job Board Enhancements
                CREATE TABLE IF NOT EXISTS job_categories (
                    id SERIAL PRIMARY KEY,
                    name_uz VARCHAR(255) NOT NULL,
                    name_ru VARCHAR(255) NOT NULL,
                    icon VARCHAR(100),
                    is_active BOOLEAN DEFAULT TRUE,
                    publication_price_mali DECIMAL(20, 4) DEFAULT 100.0000,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                -- Initial categories if none exist
                IF NOT EXISTS (SELECT 1 FROM job_categories LIMIT 1) THEN
                    INSERT INTO job_categories (name_uz, name_ru, icon, publication_price_mali) VALUES
                    ('Huquqshunos (Yurist)', 'Юрист', 'Gavel', 150.0000),
                    ('Psixolog', 'Психолог', 'HeartPulse', 100.0000),
                    ('Repetitor (O''qituvchi)', 'Репетитор', 'GraduationCap', 50.0000),
                    ('Santexnik', 'Сантехник', 'Wrench', 30.0000),
                    ('Elektrik', 'Электрик', 'Zap', 30.0000),
                    ('Usta (Remontchi)', 'Мастер по ремонту', 'Hammer', 30.0000),
                    ('Fotograf / Videograf', 'Фотограф / Видеограф', 'Camera', 80.0000),
                    ('Avtomobil ustasi', 'Автомастер', 'Car', 40.0000),
                    ('Buxgalter', 'Бухгалтер', 'Calculator', 120.0000),
                    ('Hamshira / Qarovchi', 'Медсестра / Сиделка', 'Stethoscope', 40.0000);
                END IF;

                BEGIN ALTER TABLE jobs ADD COLUMN sub_type VARCHAR(20) DEFAULT 'seeker'; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN category_id INTEGER REFERENCES job_categories(id); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN payment_status VARCHAR(20) DEFAULT 'unpaid'; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN publication_fee DECIMAL(20, 4) DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN short_text TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN full_name VARCHAR(255); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN birth_date DATE; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN location VARCHAR(255); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN experience_years INTEGER; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN salary_min DECIMAL(20, 4); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN is_salary_negotiable BOOLEAN DEFAULT TRUE; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN skills_json JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN has_diploma BOOLEAN DEFAULT FALSE; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN has_certificate BOOLEAN DEFAULT FALSE; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN resume_url TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN company_name VARCHAR(255); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN responsible_person VARCHAR(255); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN work_type VARCHAR(50); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN work_hours VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN day_off VARCHAR(100); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN age_range VARCHAR(50); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN gender_pref VARCHAR(20); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN requirements_json JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN salary_text VARCHAR(255); EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN benefits_json JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE jobs ADD COLUMN apply_method_json JSONB; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE users ADD COLUMN refresh_token TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END;

                -- Phase 5: Wallet & Monetization Extension
                CREATE TABLE IF NOT EXISTS platform_settings (
                    id SERIAL PRIMARY KEY,
                    expert_subscription_fee DECIMAL(10,2) DEFAULT 20.00,
                    commission_rate DECIMAL(4,2) DEFAULT 0.10,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                IF NOT EXISTS (SELECT 1 FROM platform_settings WHERE id = 1) THEN
                    INSERT INTO platform_settings (id, expert_subscription_fee, commission_rate) VALUES (1, 20.00, 0.10);
                END IF;

                CREATE TABLE IF NOT EXISTS platform_balance (
                    id SERIAL PRIMARY KEY,
                    balance DECIMAL(20, 4) DEFAULT 0.00,
                    total_fees_collected DECIMAL(20, 4) DEFAULT 0.00,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                IF NOT EXISTS (SELECT 1 FROM platform_balance WHERE id = 1) THEN
                    INSERT INTO platform_balance (id, balance, total_fees_collected) VALUES (1, 0.00, 0.00);
                END IF;

                BEGIN ALTER TABLE users ADD COLUMN is_expert_active BOOLEAN DEFAULT FALSE; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE users ADD COLUMN subscription_end_date TIMESTAMP WITH TIME ZONE; EXCEPTION WHEN duplicate_column THEN NULL; END;
                BEGIN ALTER TABLE token_balances ADD COLUMN locked_balance DECIMAL(20, 4) DEFAULT 0.00; EXCEPTION WHEN duplicate_column THEN NULL; END;

                -- Specialist Layers: Education,                -- MISSING TABLES FIX
                CREATE TABLE IF NOT EXISTS session_materials (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    session_id VARCHAR(255) NOT NULL,
                    uploader_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(255) NOT NULL,
                    file_url TEXT NOT NULL,
                    file_type VARCHAR(50),
                    file_size_bytes BIGINT DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                BEGIN ALTER TABLE session_materials ALTER COLUMN session_id TYPE VARCHAR(255); EXCEPTION WHEN others THEN NULL; END;

                CREATE TABLE IF NOT EXISTS quizzes (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    session_id VARCHAR(255) NOT NULL,
                    mentor_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
                BEGIN ALTER TABLE quizzes ALTER COLUMN session_id TYPE VARCHAR(255); EXCEPTION WHEN others THEN NULL; END;

                CREATE TABLE IF NOT EXISTS courses (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    price_mali DECIMAL(20, 4) DEFAULT 0,
                    is_published BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS groups (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
                    name VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS specialist_notes (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    specialist_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    patient_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    session_id UUID,
                    note TEXT,
                    is_private BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS case_folders (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    lawyer_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    client_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(255) NOT NULL,
                    status VARCHAR(50) DEFAULT 'open',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                -- Live Sessions & Chat
                CREATE TABLE IF NOT EXISTS live_sessions (
                    id VARCHAR(255) PRIMARY KEY,
                    mentor_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    title VARCHAR(255),
                    status VARCHAR(50) DEFAULT 'active',
                    recording_url TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS chat_messages (
                    id SERIAL PRIMARY KEY,
                    session_id VARCHAR(255) REFERENCES live_sessions(id) ON DELETE CASCADE,
                    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
                    text TEXT,
                    file_url TEXT,
                    type VARCHAR(50) DEFAULT 'text',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            END $$;
        `;
        console.log('>>> Executing main migration SQL...');
        await pool.query(sql);
        console.log('✅ Main migration SQL executed successfully.');

        // ========== DATABASE INDEXES ==========
        console.log('>>> Creating database indexes...');
        const indexSql = `
            -- Messages: chat xabarlarini tezkor yuklash
            CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

            -- Transactions: tranzaksiya tarixini tezkor filtrlash
            CREATE INDEX IF NOT EXISTS idx_transactions_sender_created ON transactions(sender_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_transactions_receiver ON transactions(receiver_id);
            CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
            CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

            -- Chats: chat turini filtrlash
            CREATE INDEX IF NOT EXISTS idx_chats_type ON chats(type);

            -- Chat Participants: user chatlarini topish
            CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON chat_participants(user_id);

            -- Escrow: user escrow larini topish
            CREATE INDEX IF NOT EXISTS idx_escrow_user ON escrow(user_id);
            CREATE INDEX IF NOT EXISTS idx_escrow_status ON escrow(status);

            -- Services: provider xizmatlarini topish
            CREATE INDEX IF NOT EXISTS idx_services_provider ON services(provider_id);

            -- User Contacts: kontaktlarni yuklash
            CREATE INDEX IF NOT EXISTS idx_user_contacts_user ON user_contacts(user_id);
        `;
        console.log('>>> Executing index SQL...');
        await pool.query(indexSql);
        console.log('✅ Database indexes created successfully.');

    } catch (error) {
        console.error('Auto-migration failed (this is non-critical if columns exist):', error);
    }
};


const startServer = async () => {
    try {
        console.log('--- Server Start Sequence Initiated ---');
        console.log('Environment:', process.env.NODE_ENV);
        console.log('Port:', PORT);

        // Run migrations in background to prevent blocking server startup
        runAutoMigration().then(() => {
            console.log('✅ Background auto-migration completed.');
        }).catch(err => {
            console.error('❌ Background auto-migration failed:', err);
        });

        console.log('Attempting to start server listener...');
        server.listen(PORT, () => {
            console.log(`✅ Server is now LISTENING on port ${PORT}`);
            console.log(`API URL: http://localhost:${PORT}`);
            console.log('---------------------------------------');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
