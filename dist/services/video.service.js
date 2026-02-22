"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoService = void 0;
const uuid_1 = require("uuid");
const Session_1 = require("../models/postgres/Session");
const Escrow_1 = require("../models/postgres/Escrow");
const Service_1 = require("../models/postgres/Service");
class VideoService {
    /**
     * Start a session (Generate Link)
     * Prerequisite: Funds must be in Escrow (Held).
     */
    static async startSession(userId, escrowId) {
        // 1. Verify Escrow Status
        const escrow = await Escrow_1.EscrowModel.findById(null, escrowId); // null client = global pool
        if (!escrow)
            throw new Error('Escrow record not found');
        if (escrow.status !== 'held') {
            throw new Error(`Cannot start session. Funds are not in escrow (Status: ${escrow.status})`);
        }
        // 2. Validate User (Must be Provider or Client)
        // We need service info to know who is who.
        const service = await Service_1.ServiceModel.findById(escrow.service_id);
        if (!service)
            throw new Error('Service not found');
        const providerId = service.provider_id;
        const clientId = escrow.user_id;
        if (userId !== providerId && userId !== clientId) {
            throw new Error('Unauthorized to start this session');
        }
        // 3. Check if session already exists
        const existingSession = await Session_1.SessionModel.findByEscrowId(escrowId);
        if (existingSession) {
            return existingSession; // Return existing if already started
        }
        // 4. Generate Jitsi Room Name/URL
        // Pattern: mali-platform-[escrowId]-[random]
        const roomName = `mali-platform-${escrowId.slice(0, 8)}-${(0, uuid_1.v4)().slice(0, 8)}`;
        const videoUrl = `https://${this.JITSI_DOMAIN}/${roomName}`;
        // 5. Create Session Record
        const session = await Session_1.SessionModel.create({
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
    static async endSession(userId, sessionId) {
        const session = await Session_1.SessionModel.findById(sessionId);
        if (!session)
            throw new Error('Session not found');
        // Only participants or system?
        if (session.provider_id !== userId && session.client_id !== userId) {
            throw new Error('Unauthorized');
        }
        const updatedSession = await Session_1.SessionModel.updateStatus(sessionId, 'completed', new Date());
        return updatedSession;
    }
}
exports.VideoService = VideoService;
VideoService.JITSI_DOMAIN = process.env.JITSI_DOMAIN || 'meet.jit.si';
