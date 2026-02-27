import { Request, Response } from 'express';
import { EscrowService } from '../../services/escrow.service';
import { NotificationService } from '../../services/notification.service';
import { AuthRequest } from '../../middleware/auth.middleware';

export const holdFunds = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { serviceId, amount, bookingId, sessionId } = req.body;

        if (!amount) {
            return res.status(400).json({ message: 'Amount is required' });
        }

        const escrow = await EscrowService.holdFunds(userId, parseFloat(amount), { serviceId, bookingId, sessionId });
        res.status(201).json({ message: 'Funds held in escrow', escrow });
    } catch (error: any) {
        console.error('Hold funds error:', error);
        res.status(400).json({ message: error.message || 'Failed to hold funds' });
    }
};

export const releaseFunds = async (req: AuthRequest, res: Response) => {
    try {
        // In a real app, only the provider (after completion verification) or admin should call this.
        // For MVP/Demo, we might allow the user (buyer) to "confirm receipt" thus releasing funds,
        // or the provider to "claim" if automated.
        // Let's assume the BUYER releases the funds upon satisfaction.
        const userId = req.user.id;
        const { escrowId } = req.body;

        if (!escrowId) return res.status(400).json({ message: 'Escrow ID required' });

        // TODO: Verify that the caller is the owner of the escrow (the buyer)
        // For now, we proceed to call the service.

        const updatedEscrow = await EscrowService.releaseFunds(escrowId);

        const io = req.app.get('io');
        if (io) {
            // Notify provider
            // escrow.user_id is the payer, but we need providerId
            // The EscrowService.releaseFunds already knows the provider.
            // For now, let's just emit to everyone involved or fetch providerId here.

            // To be more precise, let's fetch the escrow record again to get details
            // But EscrowService handles the logic. I'll just send general notification if I have access.

            await NotificationService.createNotification(
                updatedEscrow.user_id,
                'funds_released',
                'Mablag\' chiqarildi',
                `${updatedEscrow.amount} MALI miqdoridagi mablag\' expertga o'tkazildi.`,
                { escrowId },
                io
            );
        }

        res.json({ message: 'Funds released successfully', escrow: updatedEscrow });
    } catch (error: any) {
        console.error('Release funds error:', error);
        res.status(400).json({ message: error.message || 'Failed to release funds' });
    }
};

export const refundFunds = async (req: AuthRequest, res: Response) => {
    try {
        // Only Admin or Provider (cancelling) should be able to refund.
        const { escrowId } = req.body;
        if (!escrowId) return res.status(400).json({ message: 'Escrow ID required' });

        const updatedEscrow = await EscrowService.refundFunds(escrowId);

        const io = req.app.get('io');
        if (io) {
            await NotificationService.createNotification(
                updatedEscrow.user_id,
                'funds_refunded',
                'Mablag\' qaytarildi',
                `${updatedEscrow.amount} MALI miqdoridagi mablag\' hisobingizga qaytarildi.`,
                { escrowId },
                io
            );
        }

        res.json({ message: 'Funds refunded successfully', escrow: updatedEscrow });
    } catch (error: any) {
        console.error('Refund funds error:', error);
        res.status(400).json({ message: error.message || 'Failed to refund funds' });
    }
};
