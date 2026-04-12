import { Request, Response } from 'express';
import { pool } from '../../config/database';

export const getDesktopDownloadInfo = async (req: Request, res: Response): Promise<void> => {
    try {
        // Older bazalarda "id" ustuni bo'lmasligi mumkin, shu sababli shartsiz bitta yozuvni olamiz
        const result = await pool.query('SELECT desktop_download_url, desktop_version FROM platform_settings ORDER BY updated_at DESC LIMIT 1');
        const row = result.rows[0] || {};
        res.status(200).json({
            url: row.desktop_download_url || null,
            version: row.desktop_version || null
        });
    } catch (error) {
        console.error('Error fetching desktop download info:', error);
        res.status(500).json({ message: 'Failed to fetch desktop download info' });
    }
};

export const updateDesktopDownloadInfo = async (req: Request, res: Response): Promise<void> => {
    try {
        const { url, version } = req.body as { url?: string; version?: string };

        if (!url || typeof url !== 'string') {
            res.status(400).json({ message: 'Invalid url' });
            return;
        }

        const normalizedVersion = typeof version === 'string' && version.trim().length > 0 ? version.trim() : null;

        // Agar jadvalda "id" bo'lsa ham, bo'lmasa ham ishlashi uchun:
        // 1) Agar jadval bo'sh bo'lsa, yangi qator qo'shamiz
        // 2) Aks holda eng oxirgi yozuvni yangilaymiz

        const existing = await pool.query('SELECT ctid FROM platform_settings ORDER BY updated_at DESC LIMIT 1');

        if (existing.rows.length === 0) {
            await pool.query(
                'INSERT INTO platform_settings (desktop_download_url, desktop_version, updated_at) VALUES ($1, $2, NOW())',
                [url, normalizedVersion]
            );
        } else {
            // ctid orqali aniq satrni yangilaymiz (universal usul)
            const ctid = existing.rows[0].ctid;
            await pool.query(
                'UPDATE platform_settings SET desktop_download_url = $1, desktop_version = $2, updated_at = NOW() WHERE ctid = $3',
                [url, normalizedVersion, ctid]
            );
        }

        res.status(200).json({ message: 'Desktop download info updated', url, version: normalizedVersion });
    } catch (error) {
        console.error('Error updating desktop download info:', error);
        res.status(500).json({ message: 'Failed to update desktop download info' });
    }
}

export const getDesktopVersionInfo = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await pool.query('SELECT desktop_version, desktop_download_url FROM platform_settings ORDER BY updated_at DESC LIMIT 1');
        const row = result.rows[0] || {};
        res.status(200).json({
            version: row.desktop_version || null,
            url: row.desktop_download_url || null
        });
    } catch (error) {
        console.error('Error fetching desktop version info:', error);
        res.status(500).json({ message: 'Failed to fetch desktop version info' });
    }
};

