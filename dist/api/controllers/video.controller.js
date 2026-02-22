"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.endSession = exports.startSession = void 0;
const video_service_1 = require("../../services/video.service");
const startSession = async (req, res) => {
    try {
        const userId = req.user.id;
        const { escrowId } = req.body;
        if (!escrowId) {
            return res.status(400).json({ message: 'Escrow ID is required' });
        }
        const session = await video_service_1.VideoService.startSession(userId, escrowId);
        res.json({ message: 'Session started', session });
    }
    catch (error) {
        console.error('Start session error:', error);
        res.status(400).json({ message: error.message || 'Failed to start session' });
    }
};
exports.startSession = startSession;
const endSession = async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ message: 'Session ID is required' });
        }
        const session = await video_service_1.VideoService.endSession(userId, sessionId);
        res.json({ message: 'Session ended', session });
    }
    catch (error) {
        console.error('End session error:', error);
        res.status(400).json({ message: error.message || 'Failed to end session' });
    }
};
exports.endSession = endSession;
