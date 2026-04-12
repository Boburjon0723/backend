import { Request, Response } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import dotenv from 'dotenv';
import { pool } from '../../config/database';
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

        const userId = user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Invalid user session' });
            return;
        }

        const roomId = String(room);
        /** Konsultant kutish xonasi — `consult-lobby-<ekspert_user_id>`; chat_id UUID emas, DB so'rovsiz */
        const consultLobbyPrefix = 'consult-lobby-';
        const isConsultLobbyRoom = roomId.startsWith(consultLobbyPrefix);
        const lobbyOwnerId = isConsultLobbyRoom ? roomId.slice(consultLobbyPrefix.length) : null;
        const isOwnConsultLobby =
            isConsultLobbyRoom &&
            lobbyOwnerId != null &&
            String(userId).toLowerCase() === String(lobbyOwnerId).toLowerCase();

        if (isConsultLobbyRoom && !isOwnConsultLobby) {
            res.status(403).json({
                error: "Bu konsultatsiya kutish xonasiga kirish mumkin emas.",
            });
            return;
        }

        if (!isOwnConsultLobby) {
            const memberCheck = await pool.query(
                `SELECT 1 FROM chat_participants WHERE chat_id = $1 AND user_id = $2 LIMIT 1`,
                [roomId, userId]
            );
            if (memberCheck.rows.length === 0) {
                res.status(403).json({
                    error: "Bu suhbat (chat) a'zosi emassiz yoki xona topilmadi. Avval shaxsiy chatni oching.",
                });
                return;
            }
        }

        const apiKey = process.env.LIVEKIT_API_KEY || 'devkey';
        const apiSecret = process.env.LIVEKIT_API_SECRET || 'secret';

        const fullName = user?.name ? `${user.name}${user.surname ? ' ' + user.surname : ''}` : null;
        const participantName = fullName || user?.username || `User-${user?.id.substring(0, 4)}`;
        const isMentor = user?.isExpert || user?.role === 'expert' || user?.is_expert || false;
        const avatarUrl = user?.avatar_url || user?.avatar || null;
        const metadata = JSON.stringify({
            avatar_url: avatarUrl,
            avatar: avatarUrl,
            displayName: participantName,
            /** LiveKit client: talaba faqat mentor + o‘zini video rejimida ko‘rsatishi uchun */
            lkRole: isMentor ? 'mentor' : 'student',
        });

        const at = new AccessToken(apiKey, apiSecret, {
            identity: user.id || `guest-${Math.random()}`,
            name: participantName,
            metadata,
        });

        at.addGrant({
            roomJoin: true,
            room: room as string,
            canPublish: true,
            canPublishData: true,
            canSubscribe: true,
        });

        const token = await at.toJwt();
        const wsUrl = process.env.LIVEKIT_URL || 'ws://localhost:7880';

        // Notify group members about session activity via Socket.IO
        const io = req.app.get('io');
        if (io && room && isMentor) {
            // Mentor started — broadcast to the group room so students see join button
            io.to(room as string).emit('group_session_started', {
                roomId: room,
                mentorId: user.id,
                mentorName: participantName,
                startedAt: new Date().toISOString()
            });
        }

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

// Endpoint to mark session as ended (called when mentor clicks End Session)
const endSession = async (req: Request, res: Response): Promise<void> => {
    const { room } = req.query;
    const io = req.app.get('io');
    if (io && room) {
        io.to(room as string).emit('group_session_ended', { roomId: room });
    }
    res.status(200).json({ success: true });
};

export { createToken, endSession };
