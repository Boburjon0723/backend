import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

const storage = multer.diskStorage({
    destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
        const uploadPath = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

export const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB limit for videos
    },
    fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
        const allowedExtensions = /jpeg|jpg|png|gif|webp|pdf|doc|docx|mp3|wav|ogg|m4a|webm|mp4|mov|avi|mkv|3gp/;
        const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
        const mimetype = file.mimetype.startsWith('image/') ||
            file.mimetype.startsWith('audio/') ||
            file.mimetype.startsWith('video/') ||
            file.mimetype === 'application/pdf' ||
            file.mimetype.includes('word');

        if (extname || mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Error: Only images, videos, documents, and audio are allowed!'));
        }
    }
});
