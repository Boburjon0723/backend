import { Request, Response } from 'express';
import { pool } from '../../config/database';
import { TokenService } from '../../services/token.service';
import { NotificationService } from '../../services/notification.service';

export class WalletController {
    private static readonly MENTOR_MONTHLY_MALI = Number(process.env.MENTOR_MONTHLY_MALI || 100);
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

            if (!expertId || amount === undefined || amount === null || isNaN(amount) || amount < 0) {
                return res.status(400).json({ success: false, message: 'Expert ID and valid amount (>= 0) are required' });
            }

            const transaction = await TokenService.bookSession(studentId, expertId, parseFloat(amount));
            res.json({ success: true, data: transaction });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    static async completeSession(req: Request, res: Response) {
        try {
            const userId = (req as any).user!.id;
            const { transactionId } = req.body;
            if (!transactionId) {
                return res.status(400).json({ success: false, message: 'Transaction ID is required' });
            }

            const ld = await pool.query(
                `SELECT id, status, client_id FROM listing_service_deals WHERE transaction_id = $1::uuid LIMIT 1`,
                [transactionId]
            );
            const deal = ld.rows[0];
            if (deal) {
                if (deal.status !== 'pending_client_confirm' || String(userId) !== String(deal.client_id)) {
                    return res.status(403).json({
                        success: false,
                        message:
                            "E'londan escrow: mablag‘ni faqat mijoz tasdiqlagach chiqariladi (chatdagi escrow paneli).",
                    });
                }
            }

            const result = await TokenService.completeSession(transactionId) as any;

            if (deal) {
                await pool.query(`UPDATE listing_service_deals SET status = 'completed', updated_at = NOW() WHERE id = $1`, [
                    deal.id,
                ]);
            }
            const io = req.app.get('io');
            if (io && result.senderId) io.to(result.senderId).emit('balance_updated');
            if (io && result.receiverId) io.to(result.receiverId).emit('balance_updated');
            res.json({ success: true, amount: result.amount, netAmount: result.netAmount, fee: result.fee });
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

    static async rejectBooking(req: Request, res: Response) {
        try {
            const expertId = (req as any).user!.id;
            const { transactionId } = req.body;
            if (!transactionId) {
                return res.status(400).json({ success: false, message: 'transactionId is required' });
            }
            const result = await TokenService.cancelBooking(transactionId, expertId);
            const studentId = (result as any).studentId;
            if (studentId) {
                const io = req.app.get('io');
                await NotificationService.createNotification(
                    studentId,
                    'booking_rejected',
                    'Dars rad etildi',
                    'Ustoz sizning darsga yozilish so\'rovingizni rad etdi. Kafolatlangan MALI hisobingizga qaytarildi.',
                    { transactionId, refunded: (result as any).refunded },
                    io
                );
            }
            res.json({ ...result, success: true });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /** 30 kunlik obuna: talaba ustozga bir marta to'laydi, 30 kun davomida barcha darslarga kirishi mumkin */
    static async subscribeToMentor(req: Request, res: Response) {
        try {
            const studentId = (req as any).user!.id;
            const { mentorId } = req.body;
            if (!mentorId) {
                return res.status(400).json({ success: false, message: 'mentorId kerak' });
            }
            const amount = WalletController.MENTOR_MONTHLY_MALI;
            const result = await TokenService.subscribeToMentor(studentId, mentorId, amount);
            const io = req.app.get('io');
            if (io) {
                io.to(studentId).emit('balance_updated');
                io.to(mentorId).emit('balance_updated');
            }
            res.json({ ...result, success: true, monthlyAmount: amount });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    }

    /** Obuna holati: ustoz (mentor) bo'yicha 30 kunlik kirish huquqi bormi */
    static async getSubscriptionStatus(req: Request, res: Response) {
        try {
            const studentId = (req as any).user!.id;
            const mentorId = req.query.mentorId as string;
            if (!mentorId) {
                return res.status(400).json({ success: false, message: 'mentorId kerak' });
            }
            const sub = await TokenService.getActiveSubscription(studentId, mentorId);
            res.json({
                success: true,
                active: !!sub,
                expiresAt: sub?.expires_at || null
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
}
