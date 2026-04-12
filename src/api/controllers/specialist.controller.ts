import { Request, Response } from 'express';
import { CourseModel } from '../../models/postgres/Course';
import { GroupModel } from '../../models/postgres/Group';
import { SpecialistNoteModel } from '../../models/postgres/SpecialistNote';
import { CaseFolderModel } from '../../models/postgres/CaseFolder';
import { SessionModel } from '../../models/postgres/Session';


import { WhiteboardSnapshotModel } from '../../models/postgres/WhiteboardSnapshot';
import { MessageModel } from '../../models/postgres/Message';
import { ChatModel } from '../../models/postgres/Chat';
import { pool } from '../../config/database';

export const createCourse = async (req: Request, res: Response) => {
    try {
        const teacher_id = (req as any).user.id;
        const course = await CourseModel.create({ ...req.body, teacher_id });
        res.status(201).json(course);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export const createGroup = async (req: Request, res: Response) => {
    try {
        const group = await GroupModel.create(req.body);
        res.status(201).json(group);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export const saveNote = async (req: Request, res: Response) => {
    try {
        const specialist_id = (req as any).user.id;
        const { client_id, content, shared_with_client, chat_id, session_id, note_type } = req.body;
        const targetChatId = chat_id || session_id;
        const isSessionNote = note_type === 'session' || (!client_id && (chat_id || session_id));

        const note = await SpecialistNoteModel.create({
            specialist_id,
            client_id: isSessionNote ? null : (client_id || specialist_id),
            content,
            shared_with_client: shared_with_client !== false,
            is_private: !(shared_with_client !== false),
            note_type: isSessionNote ? 'session' : 'client'
        });

        let chatMessage: any = null;
        if (targetChatId) {
            chatMessage = await MessageModel.create(
                targetChatId,
                specialist_id,
                `📋 **Mentor xulosasi:**\n\n${content}`,
                'text',
                { is_auto_note: true, title: 'Sessiya qaydi' }
            );
            const io = req.app.get('io');
            if (io && chatMessage) {
                const ures = await pool.query(
                    'SELECT name, avatar_url FROM users WHERE id = $1 LIMIT 1',
                    [specialist_id]
                );
                const row = ures.rows[0];
                io.to(targetChatId).emit('receive_message', {
                    ...chatMessage,
                    roomId: targetChatId,
                    chat_id: targetChatId,
                    sender_name: row?.name || 'Mentor',
                    sender_avatar: row?.avatar_url || null,
                });
            }
        }

        res.status(201).json(note);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export const saveWhiteboardSnapshot = async (req: Request, res: Response) => {
    try {
        const specialist_id = (req as any).user.id;
        const { session_id, snapshot_data, chat_id } = req.body;

        const snapshot = await WhiteboardSnapshotModel.create({ session_id, snapshot_data });

        // Auto-post to chat
        if (chat_id) {
            await MessageModel.create(
                chat_id,
                specialist_id,
                "🎨 **Dars doskasi (Whiteboard) saqlandi.**",
                'image',
                {
                    url: snapshot_data,
                    is_whiteboard: true,
                    snapshot_id: snapshot.id
                }
            );
        }

        res.status(201).json(snapshot);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export const getLatestWhiteboardSnapshot = async (req: Request, res: Response) => {
    try {
        const { session_id } = req.params;
        const snapshot = await WhiteboardSnapshotModel.findLatestBySession(session_id as string);
        res.json(snapshot);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export const createCaseFolder = async (req: Request, res: Response) => {
    try {
        const lawyer_id = (req as any).user.id;
        const folder = await CaseFolderModel.create({ ...req.body, lawyer_id });
        res.status(201).json(folder);
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};
export const closeSession = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const specialist_id = (req as any).user.id;

        const session = await SessionModel.findById(id);
        if (session) {
            if (session.provider_id !== specialist_id) {
                return res.status(403).json({ message: 'Unauthorized or session not found' });
            }
            const updatedSession = await SessionModel.updateStatus(id, 'completed', new Date());
            return res.json({ success: true, session: updatedSession });
        }

        // Mentor panel: id may be a group/chat id (not in sessions table). Allow close if user owns that group.
        const { pool } = await import('../../config/database');
        const chatRes = await pool.query(
            'SELECT id, type, creator_id FROM chats WHERE id = $1',
            [id]
        );
        const chat = chatRes.rows[0];
        if (chat && chat.type === 'group' && chat.creator_id === specialist_id) {
            return res.json({ success: true, message: 'Guruh sessiyasi yopildi', groupId: id });
        }

        return res.status(403).json({ message: 'Unauthorized or session not found' });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};
