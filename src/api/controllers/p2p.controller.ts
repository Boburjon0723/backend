import { Request, Response } from 'express';
import { pool } from '../../config/database';
import { ChatModel } from '../../models/postgres/Chat';

export const getTradeDetails = async (req: Request, res: Response) => {
    const { tradeId } = req.params;
    try {
        const result = await pool.query('SELECT * FROM p2p_trades WHERE id = $1', [tradeId]);
        if (result.rows.length === 0) return res.status(404).json({ message: 'Trade not found' });
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get Trade Details Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getTradeChat = async (req: Request, res: Response) => {
    const { tradeId } = req.params;
    try {
        const result = await pool.query('SELECT * FROM chats WHERE link = $1', [`trade_${tradeId}`]);
        const chat = result.rows[0];
        if (!chat) return res.status(404).json({ message: 'Trade chat not found' });
        res.json(chat);
    } catch (error) {
        console.error('Get Trade Chat Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getAds = async (req: Request, res: Response) => {
    try {
        const { type } = req.query;
        let query = `
            SELECT p.*, u.name as user_name 
            FROM p2p_ads p 
            JOIN users u ON p.user_id = u.id 
            WHERE p.status = 'active'
        `;
        const params: any[] = [];

        if (type) {
            query += ` AND p.type = $1`;
            params.push(type);
        }

        query += ` ORDER BY p.created_at DESC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Get Ads Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const createAd = async (req: Request, res: Response) => {
    const { type, amount, price, min_limit, max_limit } = req.body;
    // @ts-ignore
    const userId = req.user.id;

    if (!amount || !price || !type) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
        if (type === 'sell') {
            const balanceRes = await pool.query('SELECT balance FROM token_balances WHERE user_id = $1', [userId]);
            const balance = parseFloat(balanceRes.rows[0]?.balance || '0');
            if (balance < amount) {
                return res.status(400).json({ message: 'Insufficient balance to create sell ad' });
            }
        }

        const result = await pool.query(
            `INSERT INTO p2p_ads (user_id, type, amount_mali, price_uzs, min_limit_uzs, max_limit_uzs, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'active')
             RETURNING *`,
            [userId, type, amount, price, min_limit || 0, max_limit || (amount * price)]
        );

        // Emit socket event for real-time update
        const io = req.app.get('io');
        if (io) {
            io.emit('p2p_ads_updated');
        }

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Create Ad Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const initiateTrade = async (req: Request, res: Response) => {
    // @ts-ignore
    const userId = req.user.id;
    const { adId, amount } = req.body;

    if (!adId || !amount) return res.status(400).json({ message: 'Missing adId or amount' });

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const adRes = await client.query('SELECT * FROM p2p_ads WHERE id = $1 FOR UPDATE', [adId]);
        if (adRes.rows.length === 0) throw new Error('Ad not found');
        const ad = adRes.rows[0];

        if (ad.status !== 'active') throw new Error('Ad is not active');
        if (ad.user_id === userId) throw new Error('Cannot trade with yourself');

        let sellerId, buyerId;
        if (ad.type === 'sell') {
            sellerId = ad.user_id;
            buyerId = userId;
        } else {
            sellerId = userId;
            buyerId = ad.user_id;
        }

        const settingsRes = await client.query("SELECT value FROM platform_settings WHERE key = 'transfer_fee_percentage'");
        const feeRate = parseFloat(settingsRes.rows[0]?.value || '0.001');

        const tradeAmount = parseFloat(amount);
        const feeAmount = tradeAmount * feeRate;
        const totalDeduct = tradeAmount + feeAmount;

        const walletRes = await client.query('SELECT balance FROM token_balances WHERE user_id = $1 FOR UPDATE', [sellerId]);
        const currentBalance = parseFloat(walletRes.rows[0]?.balance || '0');

        if (currentBalance < totalDeduct) {
            throw new Error(`Seller has insufficient funds. Required: ${totalDeduct}, Available: ${currentBalance}`);
        }

        await client.query(
            'UPDATE token_balances SET balance = balance - $1, locked_balance = locked_balance + $1 WHERE user_id = $2',
            [totalDeduct, sellerId]
        );

        const tradeRes = await client.query(
            `INSERT INTO p2p_trades (ad_id, buyer_id, seller_id, amount_mali, amount_uzs, fee_amount, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')
             RETURNING *`,
            [ad.id, buyerId, sellerId, tradeAmount, tradeAmount * parseFloat(ad.price_uzs), feeAmount]
        );

        const trade = tradeRes.rows[0];

        // Create Anonymous Trade Chat in Postgres
        try {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const chatRes = await client.query(
                    "INSERT INTO chats (type, name, link) VALUES ('private', $1, $2) RETURNING *",
                    ['P2P Trade Chat', `trade_${trade.id}`]
                );
                const chat = chatRes.rows[0];
                await client.query(
                    'INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2), ($1, $3)',
                    [chat.id, buyerId, sellerId]
                );
                await client.query('COMMIT');
            } catch (chatErr) {
                await client.query('ROLLBACK');
                console.error('Failed to create trade chat:', chatErr);
            } finally {
                client.release();
            }
        } catch (connErr) {
            console.error('DB connection error for trade chat:', connErr);
        }

        const io = req.app.get('io');
        if (io) {
            io.to(sellerId).emit('p2p_trade_initiated', { tradeId: trade.id });
            io.to(buyerId).emit('p2p_trade_initiated', { tradeId: trade.id });
        }

        await client.query('COMMIT');

        res.status(201).json({
            message: 'Trade initiated',
            trade: tradeRes.rows[0],
            fee: feeAmount
        });

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Initiate Trade Error:', error);
        res.status(400).json({ message: error.message || 'Trade failed' });
    } finally {
        client.release();
    }
};

export const confirmTrade = async (req: Request, res: Response) => {
    // @ts-ignore
    const userId = req.user.id;
    const { tradeId } = req.body; // Or match params

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const tradeRes = await client.query('SELECT * FROM p2p_trades WHERE id = $1 FOR UPDATE', [tradeId]);
        if (tradeRes.rows.length === 0) throw new Error('Trade not found');
        const trade = tradeRes.rows[0];

        if (trade.status !== 'pending') throw new Error(`Trade is ${trade.status}`);

        // Only Seller should confirm? Or Buyer marks paid, Seller confirms?
        // Simplified: Seller confirms money received.
        if (trade.seller_id !== userId) throw new Error('Only Seller can confirm receipt');

        const totalLocked = parseFloat(trade.amount_mali) + parseFloat(trade.fee_amount);

        // 1. Deduct Locked from Seller
        await client.query('UPDATE token_balances SET locked_balance = locked_balance - $1 WHERE user_id = $2', [totalLocked, trade.seller_id]);

        // 2. Add Amount to Buyer Balance
        await client.query('UPDATE token_balances SET balance = balance + $1 WHERE user_id = $2', [trade.amount_mali, trade.buyer_id]);

        // 3. Add Fee to Platform Balance
        // Check if platform balance exists, if not create default
        const platformRes = await client.query('SELECT * FROM platform_balance LIMIT 1');
        if (platformRes.rows.length === 0) {
            await client.query('INSERT INTO platform_balance (balance, total_fees_collected) VALUES ($1, $1)', [trade.fee_amount]);
        } else {
            await client.query('UPDATE platform_balance SET balance = balance + $1, total_fees_collected = total_fees_collected + $1', [trade.fee_amount]);
        }

        const io = req.app.get('io');
        if (io) {
            io.to(trade.seller_id).emit('balance_updated');
            io.to(trade.buyer_id).emit('balance_updated');
            io.to(trade.seller_id).emit('p2p_trade_updated', { tradeId });
            io.to(trade.buyer_id).emit('p2p_trade_updated', { tradeId });
        }

        await client.query('COMMIT');
        res.json({ message: 'Trade completed', status: 'completed' });

    } catch (e: any) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: e.message });
    } finally {
        client.release();
    }
};

export const cancelTrade = async (req: Request, res: Response) => {
    // @ts-ignore
    const userId = req.user.id;
    const { tradeId } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const tradeRes = await client.query('SELECT * FROM p2p_trades WHERE id = $1 FOR UPDATE', [tradeId]);
        if (tradeRes.rows.length === 0) throw new Error('Trade not found');
        const trade = tradeRes.rows[0];

        if (trade.status !== 'pending') throw new Error(`Trade is ${trade.status}`);

        // Only Admin or System timeout usually, but here maybe Buyer cancels?
        // Or Seller cancels if Buyer didn't pay?
        // Let's allow BOTH to cancel for now (Logic: Dispute if money sent? For now simple).
        if (trade.buyer_id !== userId && trade.seller_id !== userId) throw new Error('Not authorized');

        const totalLocked = parseFloat(trade.amount_mali) + parseFloat(trade.fee_amount);

        // Refund Seller: Remove from Locked, Add back to Balance
        await client.query(
            'UPDATE token_balances SET locked_balance = locked_balance - $1, balance = balance + $1 WHERE user_id = $2',
            [totalLocked, trade.seller_id]
        );

        await client.query("UPDATE p2p_trades SET status = 'cancelled' WHERE id = $1", [tradeId]);

        const io = req.app.get('io');
        if (io) {
            io.to(trade.seller_id).emit('balance_updated');
            io.to(trade.seller_id).emit('p2p_trade_updated', { tradeId });
            io.to(trade.buyer_id).emit('p2p_trade_updated', { tradeId });
        }

        await client.query('COMMIT');
        res.json({ message: 'Trade cancelled', status: 'cancelled' });

    } catch (e: any) {
        await client.query('ROLLBACK');
        res.status(400).json({ message: e.message });
    } finally {
        client.release();
    }
};

export const getMyTrades = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.user.id;
        const result = await pool.query(`
            SELECT t.*, 
                   b.name as buyer_name, 
                   s.name as seller_name,
                   a.price_uzs as rate
            FROM p2p_trades t
            JOIN users b ON t.buyer_id = b.id
            JOIN users s ON t.seller_id = s.id
            JOIN p2p_ads a ON t.ad_id = a.id
            WHERE t.buyer_id = $1 OR t.seller_id = $1
            ORDER BY t.created_at DESC
        `, [userId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Get My Trades Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getMyAds = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT * FROM p2p_ads WHERE user_id = $1 AND status = 'active' ORDER BY created_at DESC`,
            [userId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Get My Ads Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateAd = async (req: Request, res: Response) => {
    // @ts-ignore
    const userId = req.user.id;
    const { adId, price, amount, min_limit, max_limit } = req.body;

    try {
        const adRes = await pool.query('SELECT * FROM p2p_ads WHERE id = $1 AND user_id = $2', [adId, userId]);
        if (adRes.rows.length === 0) return res.status(404).json({ message: 'Ad not found or not yours' });

        if (adRes.rows[0].status !== 'active') return res.status(400).json({ message: 'Only active ads can be updated' });

        const result = await pool.query(
            `UPDATE p2p_ads 
             SET price_uzs = COALESCE($1, price_uzs), 
                 amount_mali = COALESCE($2, amount_mali),
                 min_limit_uzs = COALESCE($3, min_limit_uzs),
                 max_limit_uzs = COALESCE($4, max_limit_uzs),
                 updated_at = NOW()
             WHERE id = $5 AND user_id = $6
             RETURNING *`,
            [price, amount, min_limit, max_limit, adId, userId]
        );

        const io = req.app.get('io');
        if (io) io.emit('p2p_ads_updated');

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Update Ad Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteAd = async (req: Request, res: Response) => {
    // @ts-ignore
    const userId = req.user.id;
    const { adId } = req.params;

    try {
        const result = await pool.query(
            `UPDATE p2p_ads SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND user_id = $2 RETURNING *`,
            [adId, userId]
        );

        if (result.rows.length === 0) return res.status(404).json({ message: 'Ad not found or not yours' });

        const io = req.app.get('io');
        if (io) io.emit('p2p_ads_updated');

        res.json({ message: 'Ad deleted successfully' });
    } catch (error) {
        console.error('Delete Ad Error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
