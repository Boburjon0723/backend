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
            END $$;
        `;
        await pool.query(sql);
        console.log('Auto-migration completed successfully.');

        // ========== DATABASE INDEXES ==========
        console.log('Creating database indexes...');
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
        await pool.query(indexSql);
        console.log('Database indexes created successfully.');

    } catch (error) {
        console.error('Auto-migration failed (this is non-critical if columns exist):', error);
    }
};


const startServer = async () => {
    try {
        await runAutoMigration();
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
