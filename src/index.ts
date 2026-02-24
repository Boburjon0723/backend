import app from './app';
import http from 'http';
import { Server } from 'socket.io';
import { SocketService } from './socket/socket.service';
import dotenv from 'dotenv';
import { pool } from './config/database';

dotenv.config();

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

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
            END $$;
        `;
        await pool.query(sql);
        console.log('Auto-migration completed successfully.');
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
