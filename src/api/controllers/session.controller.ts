import { Request, Response } from 'express';
import { LiveSessionModel, ChatModel } from '../../models/postgres/LiveSession';

export const getSessionChatHistory = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sessionId } = req.params;
        const messages = await ChatModel.getSessionMessages(sessionId as string, 100, 0);
        res.status(200).json(messages);
    } catch (error) {
        console.error('Error fetching session chats:', error);
        res.status(500).json({ error: 'Failed to fetch session chats' });
    }
};

export const startSessionRecording = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sessionId } = req.params;
        // Mock Implementation for LiveKit Egress since real S3 credentials are required
        console.log(`[Egress Mock] Started recording for room: ${sessionId}`);
        res.status(200).json({ message: 'Recording started successfully', status: 'recording' });
    } catch (error) {
        console.error('Error starting recording:', error);
        res.status(500).json({ error: 'Failed to start recording' });
    }
};

export const stopSessionRecording = async (req: Request, res: Response): Promise<void> => {
    try {
        const { sessionId } = req.params;
        // Mock Implementation
        const mockUrl = `https://mali-recordings.s3.amazonaws.com/${sessionId}.mp4`;
        await LiveSessionModel.updateRecording(sessionId as string, mockUrl);
        console.log(`[Egress Mock] Stopped recording for room: ${sessionId}, saved to ${mockUrl}`);
        res.status(200).json({ message: 'Recording stopped', url: mockUrl });
    } catch (error) {
        console.error('Error stopping recording:', error);
        res.status(500).json({ error: 'Failed to stop recording' });
    }
};
