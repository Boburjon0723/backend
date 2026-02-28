import { Request, Response } from 'express';
import { CourseModel } from '../../models/postgres/Course';
import { GroupModel } from '../../models/postgres/Group';
import { SpecialistNoteModel } from '../../models/postgres/SpecialistNote';
import { CaseFolderModel } from '../../models/postgres/CaseFolder';

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
