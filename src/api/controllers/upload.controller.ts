import { Request, Response } from 'express';
import { SessionMaterialModel } from '../../models/postgres/SessionMaterial';
import { SessionModel } from '../../models/postgres/Session';
import { MessageModel } from '../../models/postgres/Message';
import { pool } from '../../config/database';
import path from 'path';
import fs from 'fs';
import { bucket } from '../../config/firebase';

async function uploadToFirebase(file: any): Promise<string> {
    const fileExt = path.extname(file.originalname);
    const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}${fileExt}`;
    const filePath = fileName;

    const fileUpload = bucket.file(filePath);

    await fileUpload.save(fs.readFileSync(file.path), {
        metadata: {
            contentType: file.mimetype,
        }
    });

    // Make the file public (or use signed URL, but publicUrl is what we were using)
    await fileUpload.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;

    // Clean up local file created by multer
    if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
    }

    return publicUrl;
}

export const uploadMaterial = async (req: Request, res: Response): Promise<void> => {
    try {
        const sessionId = req.params.sessionId as string;
        const userId = (req as any).user?.id;

        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const session = await SessionModel.findById(sessionId);
        let canUpload = false;
        if (session) {
            // Classic sessions table flow
            canUpload = session.provider_id === userId;
        } else {
            // Consultation / group flow: frontend may pass chat/group id as "sessionId"
            // 1) service_sessions (expert side)
            const ssRes = await pool.query(
                `SELECT id FROM service_sessions
                 WHERE chat_id = $1 AND expert_id = $2
                 AND status IN ('initiated', 'ongoing')
                 LIMIT 1`,
                [sessionId, userId]
            );
            if (ssRes.rows.length > 0) {
                canUpload = true;
            }

            // 2) listing deals (expert side)
            if (!canUpload) {
                const dealRes = await pool.query(
                    `SELECT id FROM listing_service_deals
                     WHERE chat_id = $1 AND expert_id = $2
                     AND status IN ('escrow_held', 'pending_client_confirm')
                     LIMIT 1`,
                    [sessionId, userId]
                );
                if (dealRes.rows.length > 0) canUpload = true;
            }

            // 3) mentor classroom group creator
            if (!canUpload) {
                const chatRes = await pool.query(
                    `SELECT id FROM chats WHERE id = $1 AND type = 'group' AND creator_id = $2 LIMIT 1`,
                    [sessionId, userId]
                );
                if (chatRes.rows.length > 0) canUpload = true;
            }
        }

        if (!canUpload) {
            res.status(403).json({ error: 'Only specialist/mentor can upload materials for this session' });
            return;
        }

        if (!req.file) {
            res.status(400).json({ error: 'No file provided' });
            return;
        }

        const file = req.file;
        const file_url = await uploadToFirebase(file);

        const material = await SessionMaterialModel.create({
            session_id: sessionId,
            uploader_id: userId,
            title: file.originalname,
            file_url: file_url,
            file_type: file.mimetype,
            file_size_bytes: file.size
        });

        // Sync with persistent chat group if it exists
        try {
            const profileRes = await pool.query('SELECT expert_groups FROM user_profiles WHERE user_id = $1', [userId]);
            const expertGroups = profileRes.rows[0]?.expert_groups;
            if (expertGroups) {
                const groups = typeof expertGroups === 'string' ? JSON.parse(expertGroups) : expertGroups;
                const activeGroup = Array.isArray(groups) ? groups.find((g: any) => g.id === sessionId) : null;

                if (activeGroup && activeGroup.chatId) {
                    await MessageModel.create(
                        activeGroup.chatId,
                        userId,
                        `📁 Yangi material: ${file.originalname}`,
                        'file',
                        {
                            file_url: file_url,
                            file_name: file.originalname,
                            file_size: file.size,
                            mimetype: file.mimetype,
                            is_material: true
                        }
                    );
                    console.log(`[Material Sync] Uploaded file synced to chat ${activeGroup.chatId}`);
                }
            }
        } catch (syncErr) {
            console.error('[Material Sync] Error:', syncErr);
        }

        res.status(201).json(material);

    } catch (error) {
        console.error('Error uploading material:', error);
        res.status(500).json({ error: 'Failed to upload material' });
    }
};

export const getSessionMaterials = async (req: Request, res: Response): Promise<void> => {
    try {
        const sessionId = req.params.sessionId as string;
        const materials = await SessionMaterialModel.findBySession(sessionId);
        res.json(materials);
    } catch (error) {
        console.error('Error fetching materials:', error);
    }
};

const MAX_RECORDING_MB = 1024;
const MAX_RECORDING_BYTES = MAX_RECORDING_MB * 1024 * 1024;

export const uploadFile = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.files && !req.file) {
            res.status(400).json({ error: 'No files uploaded' });
            return;
        }

        const files = req.files ? (req.files as any[]) : [req.file];
        const isRecording = req.query.recording === '1' || req.query.recording === 'true';
        if (isRecording) {
            for (const f of files) {
                if (f.size > MAX_RECORDING_BYTES) {
                    res.status(413).json({
                        error: `Yozuv hajmi ${MAX_RECORDING_MB} MB dan oshmasin. Iltimos, sifatni pasaytiring yoki vaqtni qisqartiring.` ,
                        maxMb: MAX_RECORDING_MB
                    });
                    return;
                }
            }
        }

        const uploadedFiles = await Promise.all(files.map(async f => {
            const publicUrl = await uploadToFirebase(f);
            return {
                name: f.originalname,
                url: publicUrl,
                type: f.mimetype,
                mimetype: f.mimetype,
                size: f.size
            };
        }));

        res.json({
            success: true,
            urls: uploadedFiles.map(f => f.url),
            files: uploadedFiles
        });
    } catch (error: any) {
        console.error('Error uploading general file:', error);
        res.status(500).json({ error: error?.message || 'Fayllarni yuklashda xatolik yuz berdi' });
    }
};

export const streamFile = async (req: Request, res: Response): Promise<void> => {
    try {
        const filename = req.params.filename as string;
        const filePath = path.join(__dirname, '../../../../uploads', filename);

        if (!fs.existsSync(filePath)) {
            res.status(404).json({ error: 'File not found' });
            return;
        }

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            if (start >= fileSize) {
                res.status(416).send('Requested range not satisfiable\n' + start + ' >= ' + fileSize);
                return;
            }

            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(filePath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'application/octet-stream', // Could detect mime here
            };

            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'application/octet-stream',
            };
            res.writeHead(200, head);
            fs.createReadStream(filePath as string).pipe(res);
        }
    } catch (error) {
        console.error('Error streaming file:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to stream file' });
        }
    }
};
