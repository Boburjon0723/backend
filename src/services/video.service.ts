import { v4 as uuidv4 } from 'uuid';
import { SessionModel } from '../models/postgres/Session';
import { EscrowModel } from '../models/postgres/Escrow';
import { ServiceModel } from '../models/postgres/Service';
import { pool } from '../config/database';

export class VideoService {
    private static JITSI_DOMAIN = process.env.JITSI_DOMAIN || 'meet.jit.si';

    /**
     * Start a session (Generate Link)
     * Prerequisite: Funds must be in Escrow (Held).
     */
    static async startSession(userId: string, escrowId: string) {
        // 1. Verify Escrow Status
        const escrow = await EscrowModel.findById(null, escrowId); // null client = global pool
        if (!escrow) throw new Error('Escrow record not found');

        if (escrow.status !== 'held') {
            throw new Error(`Cannot start session. Funds are not in escrow (Status: ${escrow.status})`);
        }

        // 2. Validate User (Must be Provider or Client)
        // We need service info to know who is who.
        const service = await ServiceModel.findById(escrow.service_id);
        if (!service) throw new Error('Service not found');

        const providerId = service.provider_id;
        const clientId = escrow.user_id;

        if (userId !== providerId && userId !== clientId) {
            throw new Error('Unauthorized to start this session');
        }

        // 3. Check if session already exists
        const existingSession = await SessionModel.findByEscrowId(escrowId);
        if (existingSession) {
            return existingSession; // Return existing if already started
        }

        // 4. Generate Jitsi Room Name/URL
        // Pattern: mali-platform-[escrowId]-[random]
        const roomName = `mali-platform-${escrowId.slice(0, 8)}-${uuidv4().slice(0, 8)}`;
        const videoUrl = `https://${this.JITSI_DOMAIN}/${roomName}`;

        // 5. Create Session Record
        const session = await SessionModel.create({
            service_id: service.id,
            provider_id: providerId,
            client_id: clientId,
            escrow_id: escrowId,
            video_url: videoUrl,
            platform: 'jitsi',
            status: 'active',
            started_at: new Date()
        });

        return session;
    }

    static async endSession(userId: string, sessionId: string) {
        const session = await SessionModel.findById(sessionId);
        if (!session) throw new Error('Session not found');

        // Only participants or system?
        if (session.provider_id !== userId && session.client_id !== userId) {
            throw new Error('Unauthorized');
        }

        const updatedSession = await SessionModel.updateStatus(sessionId, 'completed', new Date());
        return updatedSession;
    }
}
