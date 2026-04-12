import { Router } from 'express';
import { upload } from '../../middleware/upload.middleware';
import { uploadFile, streamFile } from '../controllers/upload.controller';

const router = Router();

router.post('/upload', upload.array('files', 10), uploadFile);
router.get('/stream/:filename', streamFile);

export default router;
