import { Request, Response } from 'express';
import { EscrowService } from '../../services/escrow.service';

interface AuthRequest extends Request {
    user?: any;
}

export const holdFunds = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user.id;
        const { serviceId, amount } = req.body;

        if (!serviceId || !amount) {
            return res.status(400).json({ message: 'Service ID and amount are required' });
        }

        const escrow = await EscrowService.holdFunds(userId, serviceId, parseFloat(amount));
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

        const result = await EscrowService.releaseFunds(escrowId);
        res.json({ message: 'Funds released to provider', result });
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

        const result = await EscrowService.refundFunds(escrowId);
        res.json({ message: 'Funds refunded to buyer', result });
    } catch (error: any) {
        console.error('Refund funds error:', error);
        res.status(400).json({ message: error.message || 'Failed to refund funds' });
    }
};
