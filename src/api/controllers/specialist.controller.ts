import { Request, Response } from 'express';
import { CourseModel } from '../../models/postgres/Course';
import { GroupModel } from '../../models/postgres/Group';
import { SpecialistNoteModel } from '../../models/postgres/SpecialistNote';
import { CaseFolderModel } from '../../models/postgres/CaseFolder';
import { SessionModel } from '../../models/postgres/Session';


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
        const note = await SpecialistNoteModel.create({ ...req.body, specialist_id });
        res.status(201).json(note);
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
        if (!session || session.provider_id !== specialist_id) {
            return res.status(403).json({ message: 'Unauthorized or session not found' });
        }

        // 1. Update session status
        const updatedSession = await SessionModel.updateStatus(id, 'completed', new Date());



        // 2. Settle escrow if needed
        // Optionally, we could find all pending bookings for this specialist and settle them.
        // For now, we'll return the updated session. 
        // In a full implementation, we'd loop through: 
        // const bookings = await TokenService.getExpertBookings(specialist_id);
        // for (let b of bookings) { await TokenService.completeSession(b.id); }

        res.json({ success: true, session: updatedSession });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};
