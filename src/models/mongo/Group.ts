import mongoose, { Schema, Document } from 'mongoose';

export interface IGroup extends Document {
    name: string;
    description?: string;
    adminId: string;
    members: Array<{
        userId: string;
        role: 'admin' | 'moderator' | 'member';
        joinedAt: Date;
    }>;
    isPublic: boolean;
    avatarUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}

const GroupSchema = new Schema({
    name: { type: String, required: true },
    description: { type: String },
    adminId: { type: String, required: true },
    members: [{
        userId: { type: String, required: true },
        role: {
            type: String,
            enum: ['admin', 'moderator', 'member'],
            default: 'member'
        },
        joinedAt: { type: Date, default: Date.now }
    }],
    isPublic: { type: Boolean, default: false },
    avatarUrl: { type: String }
}, {
    timestamps: true
});

export const GroupModel = mongoose.model<IGroup>('Group', GroupSchema);
