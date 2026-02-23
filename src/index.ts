import app from './app';
import http from 'http';
import { Server } from 'socket.io';
import { SocketService } from './socket/socket.service';
import dotenv from 'dotenv';

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

const startServer = async () => {
    try {
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
