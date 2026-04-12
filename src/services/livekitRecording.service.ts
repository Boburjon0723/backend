import {
    EgressClient,
    EncodedFileOutput,
    S3Upload,
    EncodedFileType,
    EncodingOptionsPreset,
} from 'livekit-server-sdk';

/** LiveKit server API host (HTTPS). LIVEKIT_URL ko‘pincha wss:// — Egress uchun https:// ga aylantiriladi. */
export function liveKitHttpHost(): string | null {
    const u = (process.env.LIVEKIT_URL || '').trim();
    if (!u) return null;
    if (u.startsWith('wss://')) return 'https://' + u.slice(6).replace(/\/$/, '');
    if (u.startsWith('ws://')) return 'http://' + u.slice(5).replace(/\/$/, '');
    return u.replace(/\/$/, '');
}

/** S3 + LiveKit kalitlari bor-yo‘qligini tekshiradi (Room Composite Egress). */
export function isLiveKitRecordingConfigured(): boolean {
    return !!(
        liveKitHttpHost() &&
        process.env.LIVEKIT_API_KEY &&
        process.env.LIVEKIT_API_SECRET &&
        process.env.AWS_ACCESS_KEY_ID &&
        process.env.AWS_SECRET_ACCESS_KEY &&
        process.env.LIVEKIT_RECORDINGS_BUCKET
    );
}

function makeEgressClient(): EgressClient | null {
    const host = liveKitHttpHost();
    const key = process.env.LIVEKIT_API_KEY;
    const secret = process.env.LIVEKIT_API_SECRET;
    if (!host || !key || !secret) return null;
    return new EgressClient(host, key, secret);
}

/** S3 ga yoziladigan kalit (LiveKit filepath). */
export function buildRecordingStagingKey(sessionId: string): string {
    const safe = String(sessionId).replace(/[^a-zA-Z0-9-_]/g, '_');
    return `mali-lessons/${safe}/${Date.now()}.mp4`;
}

export async function startRoomCompositeRecording(roomName: string, stagingKey: string): Promise<string> {
    const client = makeEgressClient();
    if (!client) throw new Error('Egress client yaratilmadi');
    const s3 = new S3Upload({
        accessKey: process.env.AWS_ACCESS_KEY_ID!,
        secret: process.env.AWS_SECRET_ACCESS_KEY!,
        region: process.env.AWS_REGION || 'us-east-1',
        bucket: process.env.LIVEKIT_RECORDINGS_BUCKET!,
    });
    if (process.env.AWS_SESSION_TOKEN) {
        s3.sessionToken = process.env.AWS_SESSION_TOKEN;
    }
    const file = new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath: stagingKey,
        output: { case: 's3', value: s3 },
    });
    const info = await client.startRoomCompositeEgress(String(roomName), file, {
        encodingOptions: EncodingOptionsPreset.H264_720P_30,
    });
    return info.egressId;
}

export function publicUrlForStagingKey(stagingKey: string | null): string | null {
    if (!stagingKey) return null;
    const key = stagingKey.replace(/^\//, '');
    const base = process.env.RECORDING_PUBLIC_BASE_URL?.replace(/\/$/, '');
    if (base) return `${base}/${key}`;
    const bucket = process.env.LIVEKIT_RECORDINGS_BUCKET;
    const region = process.env.AWS_REGION || 'us-east-1';
    if (bucket) {
        return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    }
    return null;
}

export async function stopRoomRecordingAndResolveUrl(
    egressId: string,
    stagingKey: string | null
): Promise<string | null> {
    const client = makeEgressClient();
    if (!client) {
        return publicUrlForStagingKey(stagingKey);
    }
    try {
        const info = await client.stopEgress(egressId);
        const files = info.fileResults || [];
        for (const f of files) {
            const loc = (f as { location?: string }).location || '';
            if (loc.startsWith('http://') || loc.startsWith('https://')) {
                return loc;
            }
        }
    } catch (e) {
        console.error('[Recording] stopEgress xato:', e);
    }
    return publicUrlForStagingKey(stagingKey);
}
