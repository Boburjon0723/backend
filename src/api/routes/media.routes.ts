import { Router } from 'express';
import { upload } from '../../middleware/upload.middleware';
import { uploadFile } from '../controllers/upload.controller';

const router = Router();

router.post('/upload', upload.array('files', 10), uploadFile);

export default router;
