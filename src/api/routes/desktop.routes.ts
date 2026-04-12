import { Router } from 'express';
import { getDesktopDownloadInfo, updateDesktopDownloadInfo, getDesktopVersionInfo } from '../controllers/desktop.controller';
import { authenticateToken, requireAdmin } from '../../middleware/auth.middleware';

const router = Router();

// Public endpoint to read current desktop app download info (url + version)
router.get('/desktop', getDesktopDownloadInfo);
router.get('/desktop/version', getDesktopVersionInfo);

// Admin-only endpoint to update desktop app download URL + version
router.post('/desktop', authenticateToken, requireAdmin, updateDesktopDownloadInfo);

export default router;

