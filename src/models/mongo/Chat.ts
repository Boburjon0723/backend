import mongoose, { Schema, Document } from 'mongoose';

export interface IChat extends Document {
    participants: string[]; // Array of UUIDs from Postgres
    creatorId?: string; // UUID of the channel owner
    type: 'private' | 'group' | 'channel';
    name?: string; // For groups/channels 
    description?: string;
    avatar?: string;
    link?: string; // unique link like t.me/link
    channelType?: 'public' | 'private';
    lastMessage?: string;
    lastMessageAt?: Date;
    isCommunity?: boolean;
    category?: string; // e.g. 'regional', 'interest', 'news'
    region?: string;
    district?: string;
    isPrivate?: boolean;
    isTrade?: boolean;
    tradeId?: string;
    createdAt: Date;
    updatedAt: Date;
}

const ChatSchema = new Schema({
    participants: [{ type: String, required: true }],
    creatorId: { type: String },
    type: {
        type: String,
        enum: ['private', 'group', 'channel'],
        default: 'private'
    },
    name: { type: String },
    description: { type: String },
    avatar: { type: String },
    link: { type: String, unique: true, sparse: true },
    channelType: { type: String, enum: ['public', 'private'], default: 'public' },
    lastMessage: { type: String },
    lastMessageAt: { type: Date },
    isCommunity: { type: Boolean, default: false },
    category: { type: String },
    region: { type: String },
    district: { type: String },
    isPrivate: { type: Boolean, default: true },
    isTrade: { type: Boolean, default: false },
    tradeId: { type: String }
}, {
    timestamps: true
});

ChatSchema.index({ link: 1 }, { unique: true, sparse: true });

// Index for finding user's chats efficiently
ChatSchema.index({ participants: 1 });
ChatSchema.index({ updatedAt: -1 });

export const ChatModel = mongoose.model<IChat>('Chat', ChatSchema);
