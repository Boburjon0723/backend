import { Request, Response } from 'express';

export const uploadFile = async (req: Request, res: Response) => {
    try {
        const files = (req as any).files;
        if (!files || files.length === 0) {
            // Fallback for single file if somehow called that way
            const file = (req as any).file;
            if (!file) {
                return res.status(400).json({ message: 'No file uploaded' });
            }
            return res.status(200).json({
                message: 'File uploaded successfully',
                url: `uploads/${file.filename}`,
                filename: file.originalname,
                mimetype: file.mimetype,
                size: file.size
            });
        }

        const uploadedFiles = files.map((file: any) => ({
            url: `uploads/${file.filename}`,
            filename: file.originalname,
            mimetype: file.mimetype,
            size: file.size
        }));

        res.status(200).json({
            message: 'Files uploaded successfully',
            files: uploadedFiles,
            // Keep single url for backward compatibility if only 1 file
            url: uploadedFiles[0].url
        });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
