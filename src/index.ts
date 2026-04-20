import 'dotenv/config';
import app from './app';
import http from 'http';
import { Server } from 'socket.io';
import { SocketService } from './socket/socket.service';
import { pool } from './config/database';
import { TokenService } from './services/token.service';

import { createAdapter } from '@socket.io/redis-adapter';
import { redisClient, subClient } from './config/redis';
import { setupSwagger } from './config/swagger';


const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

const parseOriginList = (raw: string | undefined): string[] =>
    String(raw || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

const socketCorsOrigins = parseOriginList(process.env.SOCKET_CORS_ORIGINS || process.env.CORS_ORIGINS);

const isSocketOriginAllowed = (origin: string): boolean => {
    if (socketCorsOrigins.length === 0) {
        return process.env.NODE_ENV !== 'production';
    }
    return socketCorsOrigins.includes(origin);
};

// Initialize Socket.IO
const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (isSocketOriginAllowed(origin)) return callback(null, true);
            return callback(new Error('Socket.IO CORS origin is not allowed'));
        },
        methods: ["GET", "POST"],
        credentials: true
    },
    // Prioritize websocket transport
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
});

// Use Redis Adapter if clients are available
if (redisClient && subClient) {
    io.adapter(createAdapter(redisClient, subClient));
    console.log('Socket.io Redis adapter initialized.');
}

// Attach io to app for access in controllers
app.set('io', io);

new SocketService(io);

// Setup Swagger Documentation (before starting server)
setupSwagger(app);


const runAutoMigration = async () => {
    try {
        console.log('>>> Running granular auto-migration...');

        const runQuery = async (name: string, sql: string) => {
            try {
                await pool.query(sql);
                // console.log(`  [OK] ${name}`);
            } catch (err: any) {
                console.error(`  [FAIL] ${name}:`, err.message);
            }
        };

        // 1. Column Additions (User Profiles)
        const profileCols = [
            'specialization_details TEXT', 'has_diploma BOOLEAN DEFAULT FALSE',
            'institution VARCHAR(255)', 'current_workplace VARCHAR(255)',
            'diploma_url TEXT', 'certificate_url TEXT', 'id_url TEXT',
            'selfie_url TEXT', 'resume_url TEXT', 'anketa_url TEXT',
            "pricing_model VARCHAR(20) DEFAULT 'hourly'",
            'hourly_rate DECIMAL(20, 4) DEFAULT 0',
            'currency VARCHAR(10) DEFAULT \'MALI\'', 'service_languages TEXT',
            'service_format VARCHAR(100)', 'bio_expert TEXT', 'specialty_desc TEXT',
            'expert_proposal TEXT', 'services_json JSONB',
            'expert_groups TEXT', 'expert_fee_total DECIMAL(20, 4) DEFAULT 0'
        ];
        for (const col of profileCols) {
            const colName = col.split(' ')[0];
            await runQuery(`AddCol_Profile_${colName}`, `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS ${col}`);
        }

        // 2. Refresh Token
        await runQuery('AddCol_User_RefreshToken', 'ALTER TABLE users ADD COLUMN IF NOT EXISTS refresh_token TEXT');
        await runQuery('AddCol_User_ExpertActive', 'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_expert_active BOOLEAN DEFAULT FALSE');
        await runQuery('AddCol_User_SubEndDate', 'ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP WITH TIME ZONE');

        // 3. Job Categories
        await runQuery('CreateTable_JobCategories', `
            CREATE TABLE IF NOT EXISTS job_categories (
                id SERIAL PRIMARY KEY,
                name_uz VARCHAR(255) NOT NULL,
                name_ru VARCHAR(255) NOT NULL,
                icon VARCHAR(100),
                is_active BOOLEAN DEFAULT TRUE,
                publication_price_mali DECIMAL(20, 4) DEFAULT 100.0000,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Check and Seed Job Categories
        try {
            const catCheck = await pool.query('SELECT 1 FROM job_categories LIMIT 1');
            if (catCheck.rows.length === 0) {
                await runQuery('Seed_JobCategories', `
                    INSERT INTO job_categories (name_uz, name_ru, icon, publication_price_mali) VALUES
                    ('Huquqshunos (Yurist)', 'Юрист', 'Gavel', 150.0000),
                    ('Psixolog', 'Психолог', 'HeartPulse', 100.0000),
                    ('Repetitor (O''qituvchi)', 'Репетитор', 'GraduationCap', 50.0000),
                    ('Hamshira / Qarovchi', 'Медсестра / Сиделка', 'Stethoscope', 40.0000)
                `);
            }
        } catch (e) { }

        // 4. Job Board Updates
        const jobCols = [
            'sub_type VARCHAR(20) DEFAULT \'seeker\'', 'category_id INTEGER REFERENCES job_categories(id)',
            'payment_status VARCHAR(20) DEFAULT \'unpaid\'', 'publication_fee DECIMAL(20, 4) DEFAULT 0',
            'short_text TEXT', 'full_name VARCHAR(255)', 'birth_date DATE', 'location VARCHAR(255)',
            'experience_years INTEGER', 'salary_min DECIMAL(20, 4)', 'is_salary_negotiable BOOLEAN DEFAULT TRUE',
            'skills_json JSONB', 'has_diploma BOOLEAN DEFAULT FALSE', 'has_certificate BOOLEAN DEFAULT FALSE',
            'resume_url TEXT', 'company_name VARCHAR(255)', 'responsible_person VARCHAR(255)',
            'work_type VARCHAR(50)', 'work_hours VARCHAR(100)', 'day_off VARCHAR(100)',
            'age_range VARCHAR(50)', 'gender_pref VARCHAR(20)', 'requirements_json JSONB',
            'salary_text VARCHAR(255)', 'benefits_json JSONB', 'apply_method_json JSONB'
        ];
        for (const col of jobCols) {
            const colName = col.split(' ')[0];
            await runQuery(`AddCol_Job_${colName}`, `ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ${col}`);
        }

        // 5. Wallet & Platform
        await runQuery('CreateTable_PlatformSettings', `
            CREATE TABLE IF NOT EXISTS platform_settings (
                id SERIAL PRIMARY KEY,
                expert_subscription_fee DECIMAL(10,2) DEFAULT 20.00,
                commission_rate DECIMAL(4,2) DEFAULT 0.10,
                desktop_download_url TEXT,
                desktop_version VARCHAR(20),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Ensure new desktop columns exist for older databases
        await runQuery(
            'AddCol_PlatformSettings_DesktopDownloadUrl',
            'ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS desktop_download_url TEXT'
        );
        await runQuery(
            'AddCol_PlatformSettings_DesktopVersion',
            'ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS desktop_version VARCHAR(20)'
        );
        await runQuery(
            'AddCol_PlatformSettings_AdminCardNumber',
            'ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS admin_card_number VARCHAR(32)'
        );
        // platform_settings (key,value) sxemasidan (id,...) ga migratsiya – "column id does not exist" xatosini bartaraf etish
        try {
            const hasId = await pool.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'platform_settings' AND column_name = 'id'`);
            if (hasId.rows.length === 0) {
                await pool.query(`CREATE TABLE platform_settings_new (id SERIAL PRIMARY KEY, expert_subscription_fee DECIMAL(10,2) DEFAULT 20.00, commission_rate DECIMAL(4,2) DEFAULT 0.10, desktop_download_url TEXT, desktop_version VARCHAR(20), admin_card_number VARCHAR(32), updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP)`);
                await pool.query(`INSERT INTO platform_settings_new (id, expert_subscription_fee, commission_rate) VALUES (1, 20.00, 0.10)`);
                await pool.query(`DROP TABLE platform_settings`);
                await pool.query(`ALTER TABLE platform_settings_new RENAME TO platform_settings`);
                console.log('[Migration] platform_settings key/value -> id schema');
            }
        } catch (e: any) {
            if (!e?.message?.includes('already exists')) console.warn('[Migration] platform_settings:', e?.message);
        }

        // Seed platform settings if empty
        try {
            const psCheck = await pool.query('SELECT 1 FROM platform_settings LIMIT 1');
            if (psCheck.rows.length === 0) {
                await runQuery('Seed_PlatformSettings', 'INSERT INTO platform_settings (id, expert_subscription_fee, commission_rate) VALUES (1, 20.00, 0.10)');
            }
        } catch (e) { }

        await runQuery('CreateTable_PlatformBalance', `
            CREATE TABLE IF NOT EXISTS platform_balance (
                id SERIAL PRIMARY KEY,
                balance DECIMAL(20, 4) DEFAULT 0.00,
                total_fees_collected DECIMAL(20, 4) DEFAULT 0.00,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Seed platform balance if empty
        try {
            const pbCheck = await pool.query('SELECT 1 FROM platform_balance LIMIT 1');
            if (pbCheck.rows.length === 0) {
                await runQuery('Seed_PlatformBalance', 'INSERT INTO platform_balance (id, balance, total_fees_collected) VALUES (1, 0.00, 0.00)');
            }
        } catch (e) { }

        await runQuery('AddCol_TokenBalance_Locked', 'ALTER TABLE token_balances ADD COLUMN IF NOT EXISTS locked_balance DECIMAL(20, 4) DEFAULT 0.00');

        // 6. Specialist & Session Extensions
        await runQuery('CreateTable_SessionMaterials', `
            CREATE TABLE IF NOT EXISTS session_materials (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                session_id VARCHAR(255) NOT NULL,
                uploader_id UUID REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                file_url TEXT NOT NULL,
                file_type VARCHAR(50),
                file_size_bytes BIGINT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await runQuery('Alter_SessionMaterials_SessionID', 'ALTER TABLE session_materials ALTER COLUMN session_id TYPE VARCHAR(255) USING session_id::text');

        await runQuery('CreateTable_Quizzes', `
            CREATE TABLE IF NOT EXISTS quizzes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                session_id VARCHAR(255) NOT NULL,
                mentor_id UUID REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await runQuery('Alter_Quizzes_SessionID', 'ALTER TABLE quizzes ALTER COLUMN session_id TYPE VARCHAR(255) USING session_id::text');

        // Notification Table
        await runQuery('CreateTable_Notifications', `
            CREATE TABLE IF NOT EXISTS notifications (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                type VARCHAR(100) NOT NULL,
                title VARCHAR(255) NOT NULL,
                message TEXT,
                data JSONB,
                is_read BOOLEAN DEFAULT FALSE,
                read_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Sessions Table (Standard)
        await runQuery('CreateTable_Sessions', `
            CREATE TABLE IF NOT EXISTS sessions (
                id VARCHAR(255) PRIMARY KEY,
                service_id UUID,
                provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
                client_id UUID REFERENCES users(id) ON DELETE CASCADE,
                escrow_id UUID,
                video_url TEXT,
                platform VARCHAR(50) DEFAULT 'jitsi',
                status VARCHAR(50) DEFAULT 'scheduled',
                started_at TIMESTAMP WITH TIME ZONE,
                ended_at TIMESTAMP WITH TIME ZONE,
                duration_seconds INTEGER,
                metadata JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await runQuery('Alter_Sessions_ID', 'ALTER TABLE sessions ALTER COLUMN id TYPE VARCHAR(255) USING id::text');

        // Live Sessions (Alternative table used by some features)
        await runQuery('CreateTable_LiveSessions', `
            CREATE TABLE IF NOT EXISTS live_sessions (
                id VARCHAR(255) PRIMARY KEY,
                mentor_id UUID REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(255),
                status VARCHAR(50) DEFAULT 'active',
                recording_url TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await runQuery('Alter_LiveSessions_EgressId', 'ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS egress_id VARCHAR(255)');
        await runQuery('Alter_LiveSessions_StagingKey', 'ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS recording_staging_key TEXT');

        await runQuery('CreateTable_ChatMessages', `
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(255) REFERENCES live_sessions(id) ON DELETE CASCADE,
                sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
                receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
                text TEXT,
                file_url TEXT,
                type VARCHAR(50) DEFAULT 'text',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // expert_reviews table
        await runQuery('CreateTable_ExpertReviews', `
            CREATE TABLE IF NOT EXISTS expert_reviews (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                expert_id UUID REFERENCES users(id) ON DELETE CASCADE,
                client_id UUID REFERENCES users(id) ON DELETE CASCADE,
                rating INTEGER CHECK (rating >= 1 AND rating <= 5),
                comment TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Telegram & password reset support
        await runQuery(
            'AddCol_User_TelegramChatId',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT'
        );
        await runQuery(
            'AddCol_User_TelegramLinkCode',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_link_code VARCHAR(32)'
        );

        await runQuery('CreateTable_PasswordResetCodes', `
            CREATE TABLE IF NOT EXISTS password_reset_codes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                code VARCHAR(10) NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                is_used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await runQuery(
            'AddCol_User_PhoneVerified',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT TRUE'
        );
        await runQuery('CreateTable_PhoneVerificationCodes', `
            CREATE TABLE IF NOT EXISTS phone_verification_codes (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                code VARCHAR(10) NOT NULL,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                is_used BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Admin login audit table
        await runQuery('CreateTable_AdminLoginAudit', `
            CREATE TABLE IF NOT EXISTS admin_login_audit (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                phone_or_email VARCHAR(255) NOT NULL,
                ip_address VARCHAR(255),
                user_agent TEXT,
                success BOOLEAN NOT NULL,
                reason VARCHAR(50),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Bots table (user-created bots, token auth for external API)
        await runQuery('CreateTable_Bots', `
            CREATE TABLE IF NOT EXISTS bots (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                username VARCHAR(100) NOT NULL,
                token_prefix VARCHAR(20) NOT NULL,
                token_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(username)
            )
        `);
        await runQuery('Idx_Bots_UserId', 'CREATE INDEX IF NOT EXISTS idx_bots_user_id ON bots(user_id)');
        await runQuery('Idx_Bots_Username', 'CREATE INDEX IF NOT EXISTS idx_bots_username ON bots(username)');
        await runQuery('Idx_Bots_TokenPrefix', 'CREATE INDEX IF NOT EXISTS idx_bots_token_prefix ON bots(token_prefix)');

        await runQuery(
            'AddCol_Chats_Metadata',
            'ALTER TABLE chats ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT \'{}\'::jsonb'
        );

        await runQuery('CreateTable_ListingServiceDeals', `
            CREATE TABLE IF NOT EXISTS listing_service_deals (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
                expert_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                amount NUMERIC(20, 4) NOT NULL,
                currency VARCHAR(10) DEFAULT 'MALI',
                status VARCHAR(32) NOT NULL DEFAULT 'pending_payment',
                transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await runQuery(
            'Idx_ListingDeals_Chat',
            'CREATE INDEX IF NOT EXISTS idx_listing_deals_chat ON listing_service_deals(chat_id)'
        );
        await runQuery(
            'Idx_ListingDeals_Status',
            'CREATE INDEX IF NOT EXISTS idx_listing_deals_status ON listing_service_deals(status)'
        );

        // Xabarlar o‘qilganligi (socket markAsRead, MessageModel.markAsRead)
        await runQuery(
            'AddCol_Messages_IsRead',
            'ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE'
        );

        // Indexing
        console.log('>>> Applying database indexing...');
        await runQuery('Idx_Msg_Created', 'CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at DESC)');
        await runQuery('Idx_Tx_Sender', 'CREATE INDEX IF NOT EXISTS idx_transactions_sender_created ON transactions(sender_id, created_at DESC)');
        await runQuery('Idx_Tx_Receiver', 'CREATE INDEX IF NOT EXISTS idx_transactions_receiver ON transactions(receiver_id)');
        await runQuery('Idx_Notif_User', 'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');

        console.log('✅ Background auto-migration completed.');
    } catch (error) {
        console.error('Fatal auto-migration error:', error);
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

            // Periodically check for expired escrow bookings and listing deals (every 15 minutes)
            const CHECK_INTERVAL = 15 * 60 * 1000;
            setInterval(() => {
                TokenService.releaseExpiredBookings();
                TokenService.autoCompleteListingDeals(io);
            }, CHECK_INTERVAL);
            // Run once on startup
            TokenService.releaseExpiredBookings();
            TokenService.autoCompleteListingDeals(io);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
