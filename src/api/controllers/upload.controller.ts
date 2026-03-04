import { Request, Response } from 'express';
import { SessionMaterialModel } from '../../models/postgres/SessionMaterial';
import { SessionModel } from '../../models/postgres/Session';
import { MessageModel } from '../../models/postgres/Message';
import { pool } from '../../config/database';
import path from 'path';
import fs from 'fs';
import { supabase } from '../../config/supabase';

const BUCKET_NAME = 'mali-media';

async function uploadToSupabase(file: any): Promise<string> {
    const fileExt = path.extname(file.originalname);
    const fileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}${fileExt}`;
    const filePath = `${fileName}`;

    const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, fs.readFileSync(file.path), {
            contentType: file.mimetype,
            upsert: false
        });

    if (error) {
        throw error;
    }

    const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

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
        if (!session) {
            res.status(404).json({ error: 'Session not found' });
            return;
        }

        // Only provider (mentor/teacher) can upload to session
        if (session.provider_id !== userId) {
            res.status(403).json({ error: 'Only the session provider can upload materials' });
            return;
        }

        if (!req.file) {
            res.status(400).json({ error: 'No file provided' });
            return;
        }

        const file = req.file;
        const file_url = await uploadToSupabase(file);

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

export const uploadFile = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.files && !req.file) {
            res.status(400).json({ error: 'No files uploaded' });
            return;
        }

        const files = req.files ? (req.files as any[]) : [req.file];

        const uploadedFiles = await Promise.all(files.map(async f => {
            const publicUrl = await uploadToSupabase(f);
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
    } catch (error) {
        console.error('Error uploading general file:', error);
        res.status(500).json({ error: 'Failed to upload files' });
    }
};

export const streamFile = async (req: Request, res: Response): Promise<void> => {
    try {
        const filename = req.params.filename;
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
