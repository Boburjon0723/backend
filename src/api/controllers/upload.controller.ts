import { Request, Response } from 'express';
import { SessionMaterialModel } from '../../models/postgres/SessionMaterial';
import { SessionModel } from '../../models/postgres/Session';
import path from 'path';

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

        // In a real app we upload to S3/MinIO. Here we assume multer saves locally and gives us a filename.
        // For development, we'll store public URL assuming static serving of /uploads folder.
        const file_url = `/uploads/${file.filename}`;

        const material = await SessionMaterialModel.create({
            session_id: sessionId,
            uploader_id: userId,
            title: file.originalname,
            file_url: file_url,
            file_type: file.mimetype,
            file_size_bytes: file.size
        });

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
        const urls = files.map(f => `/uploads/${f.filename}`);

        res.json({
            success: true,
            urls,
            files: files.map(f => ({
                name: f.originalname,
                url: `/uploads/${f.filename}`,
                type: f.mimetype,
                mimetype: f.mimetype,
                size: f.size
            }))
        });
    } catch (error) {
        console.error('Error uploading general file:', error);
        res.status(500).json({ error: 'Failed to upload files' });
    }
};
