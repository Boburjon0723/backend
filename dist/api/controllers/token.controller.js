"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transfer = exports.getBalance = void 0;
const token_service_1 = require("../../services/token.service");
const getBalance = async (req, res) => {
    try {
        const userId = req.user.id;
        const balance = await token_service_1.TokenService.getBalance(userId);
        res.json(balance);
    }
    catch (error) {
        console.error('Get balance error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getBalance = getBalance;
const transfer = async (req, res) => {
    try {
        const senderId = req.user.id;
        const { receiverId, amount, note } = req.body;
        if (!receiverId || !amount) {
            return res.status(400).json({ message: 'Receiver ID and amount are required' });
        }
        const result = await token_service_1.TokenService.transferTokens({
            senderId,
            receiverId,
            amount: parseFloat(amount),
            note
        });
        res.json({
            message: 'Transfer successful',
            transaction: result
        });
    }
    catch (error) {
        console.error('Transfer error:', error);
        res.status(400).json({ message: error.message || 'Transfer failed' });
    }
};
exports.transfer = transfer;
