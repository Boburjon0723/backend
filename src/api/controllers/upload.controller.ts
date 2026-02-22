import { Request, Response } from 'express';

export const uploadFile = async (req: Request, res: Response) => {
    try {
        const file = (req as any).file;
        if (!file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Return the relative path to be stored in the database
        const relativePath = `uploads/${file.filename}`;

        res.status(200).json({
            message: 'File uploaded successfully',
            url: relativePath,
            filename: file.originalname,
            mimetype: file.mimetype,
            size: file.size
        });
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
