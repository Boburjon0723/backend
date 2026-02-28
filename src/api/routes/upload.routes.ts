import { Router } from 'express';
import multer from 'multer';
import { uploadMaterial, getSessionMaterials } from '../controllers/upload.controller';
import { authenticateToken } from '../../middleware/auth.middleware';
import path from 'path';
import fs from 'fs';

const router = Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
});

router.post('/sessions/:sessionId/materials', authenticateToken, upload.single('material'), uploadMaterial);
router.get('/sessions/:sessionId/materials', authenticateToken, getSessionMaterials);

export default router;
