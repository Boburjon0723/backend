import { Request, Response } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import dotenv from 'dotenv';
dotenv.config();

const createToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const { room } = req.query;
        // @ts-ignore
        const user = req.user; // populated by authenticateToken middleware

        if (!room) {
            res.status(400).json({ error: 'Missing "room" query parameter' });
            return;
        }

        // LiveKit configuration (In prod, these should be real secrets)
        const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
        const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';

        // Define participant identity and role
        const participantName = user?.name || user?.username || `User-${user?.id.substring(0, 4)}`;
        const isMentor = user?.isExpert || false;

        const at = new AccessToken(apiKey, apiSecret, {
            identity: user.id || `guest-${Math.random()}`,
            name: participantName,
        });

        // Mentors get full control. Students get limited permissions initially.
        at.addGrant({
            roomJoin: true,
            room: room as string,
            canPublish: isMentor ? true : false, // Students might only watch unless unmuted
            canPublishData: true,
            canSubscribe: true,
        });

        const token = await at.toJwt();

        // Return WebSocket URL to connect
        const wsUrl = process.env.LIVEKIT_URL || 'ws://localhost:7880';

        res.status(200).json({
            token,
            wsUrl,
            role: isMentor ? 'mentor' : 'student'
        });
    } catch (error) {
        console.error('Failed to generate LiveKit Token:', error);
        res.status(500).json({ error: 'Failed to generate Video Token' });
    }
};

export { createToken };
