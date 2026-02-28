import express from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import morgan from 'morgan';
import healthRoutes from './api/routes/health.routes';
import authRoutes from './api/routes/auth.routes';
import tokenRoutes from './api/routes/token.routes';
import serviceRoutes from './api/routes/service.routes';
import escrowRoutes from './api/routes/escrow.routes';
import videoRoutes from './api/routes/video.routes';
import userRoutes from './api/routes/user.routes';
import chatRoutes from './api/routes/chat.routes';
import adminRoutes from './api/routes/admin.routes';
import jobRoutes from './api/routes/job.routes';
import p2pRoutes from './api/routes/p2p.routes';
import mediaRoutes from './api/routes/media.routes';
import expenseRoutes from './api/routes/expense.routes';
import notificationRoutes from './api/routes/notification.routes';
import specialistRoutes from './api/routes/specialist.routes';
import uploadRoutes from './api/routes/upload.routes';
import quizRoutes from './api/routes/quiz.routes';
import livekitRoutes from './api/routes/livekit.routes';
import sessionRoutes from './api/routes/session.routes';
import walletRoutes from './api/routes/wallet.routes';

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors({
    origin: true, // Reflect request origin
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// Request Debugger
app.use((req, res, next) => {
    console.log(`[REQ] ${req.method} ${req.url}`);
    next();
});
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));
// Global Rate Limiting - TEMPORARILY DISABLED FOR DEBUGGING
// app.use(globalLimiter);
app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Diagnostic Route
app.get('/api/ping', (req, res) => {
    console.log('[PING] Diagnostic ping received');
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Routes
app.use('/api', healthRoutes);
app.use('/api', authRoutes);
app.use('/api/token', tokenRoutes);
app.use('/api/service', serviceRoutes);
app.use('/api', escrowRoutes);
app.use('/api', videoRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/p2p', p2pRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/specialists', specialistRoutes);
app.use('/api', uploadRoutes);
app.use('/api', quizRoutes);
app.use('/api', livekitRoutes);
app.use('/api', sessionRoutes);
app.use('/api/wallet', walletRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

export default app;