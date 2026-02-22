import { Request, Response } from 'express';
import { VideoService } from '../../services/video.service';

interface AuthRequest extends Request {
    user?: any;
}

export const startSession = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { escrowId } = req.body;

        if (!escrowId) {
            return res.status(400).json({ message: 'Escrow ID is required' });
        }

        const session = await VideoService.startSession(userId, escrowId);
        res.json({ message: 'Session started', session });
    } catch (error: any) {
        console.error('Start session error:', error);
        res.status(400).json({ message: error.message || 'Failed to start session' });
    }
};

export const endSession = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({ message: 'Session ID is required' });
        }

        const session = await VideoService.endSession(userId, sessionId);
        res.json({ message: 'Session ended', session });
    } catch (error: any) {
        console.error('End session error:', error);
        res.status(400).json({ message: error.message || 'Failed to end session' });
    }
};
