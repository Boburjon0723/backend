import { Request, Response } from 'express';
import { TokenService } from '../../services/token.service';

export class WalletController {
    static async getBalance(req: Request, res: Response) {
        try {
            const userId = (req as any).user!.id;
            const balance = await TokenService.getBalance(userId);
            res.json({ success: true, data: balance });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async subscribeExpert(req: Request, res: Response) {
        try {
            const userId = (req as any).user!.id;
            const result = await TokenService.subscribeToExpert(userId);
            res.json(result);
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    static async bookSession(req: Request, res: Response) {
        try {
            const studentId = (req as any).user!.id;
            const { expertId, amount } = req.body;

            if (!expertId || !amount) {
                return res.status(400).json({ success: false, message: 'Expert ID and amount are required' });
            }

            const transaction = await TokenService.bookSession(studentId, expertId, parseFloat(amount));
            res.json({ success: true, data: transaction });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    static async completeSession(req: Request, res: Response) {
        try {
            const { transactionId } = req.body;
            if (!transactionId) {
                return res.status(400).json({ success: false, message: 'Transaction ID is required' });
            }

            const result = await TokenService.completeSession(transactionId);
            res.json(result);
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    static async getPlatformSettings(req: Request, res: Response) {
        try {
            const settings = await TokenService.getPlatformSettings();
            res.json({ success: true, data: settings });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }

    static async getMyBookings(req: Request, res: Response) {
        try {
            const expertId = (req as any).user!.id;
            const bookings = await TokenService.getExpertBookings(expertId);
            res.json({ success: true, data: bookings });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}
