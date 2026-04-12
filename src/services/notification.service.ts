import { pool } from '../config/database';

export interface Notification {
    id: string;
    user_id: string;
    type: string;
    title: string;
    message: string;
    data: any;
    is_read: boolean;
    created_at: Date;
}

export class NotificationService {
    /**
     * Create and send a notification
     */
    static async createNotification(userId: string, type: string, title: string, message: string, data: any = {}, io?: any) {
        try {
            const query = `
                INSERT INTO notifications (user_id, type, title, message, data)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;
            const result = await pool.query(query, [userId, type, title, message, JSON.stringify(data)]);
            const notification = result.rows[0];

            if (io) {
                // Emit to user's private room
                io.to(userId).emit('new_notification', notification);
            }

            return notification;
        } catch (error) {
            console.error('Failed to create notification:', error);
            // Non-blocking error
        }
    }

    /**
     * Get user notifications
     */
    static async getUserNotifications(userId: string, limit: number = 20) {
        const query = `
            SELECT * FROM notifications 
            WHERE user_id = $1 
            ORDER BY created_at DESC 
            LIMIT $2
        `;
        const result = await pool.query(query, [userId, limit]);
        return result.rows;
    }

    /**
     * Mark notification as read
     */
    static async markAsRead(notificationId: string, userId: string) {
        const query = `
            UPDATE notifications 
            SET is_read = true, read_at = NOW() 
            WHERE id = $1 AND user_id = $2
            RETURNING *
        `;
        const result = await pool.query(query, [notificationId, userId]);
        return result.rows[0];
    }
}
