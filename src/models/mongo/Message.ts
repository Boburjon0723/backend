import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
    roomId: string; // Group ID or composite ID for private chat (minId_maxId)
    senderId: string;
    senderName: string;
    content: string;
    type: 'text' | 'image' | 'video' | 'file' | 'system' | 'voice';
    metadata?: any;
    createdAt: Date;
}

const MessageSchema = new Schema({
    roomId: { type: String, required: true, index: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    content: { type: String, required: true },
    type: {
        type: String,
        enum: ['text', 'image', 'video', 'file', 'system', 'voice'],
        default: 'text'
    },
    metadata: { type: Schema.Types.Mixed },
}, {
    timestamps: true
});

export const MessageModel = mongoose.model<IMessage>('Message', MessageSchema);
