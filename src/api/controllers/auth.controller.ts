import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserModel } from '../../models/postgres/User';

export const register = async (req: Request, res: Response) => {
    try {
        console.log("📝 Register Request Body:", req.body); // DEBUGGING
        const { phone, password, name, surname, age } = req.body;

        if (!phone || !password || !name) {
            return res.status(400).json({ message: 'Phone, password, and name are required' });
        }

        const existingUser = await UserModel.findByPhone(phone);
        if (existingUser) {
            return res.status(409).json({ message: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUser = await UserModel.create(phone, passwordHash, name, surname, age);

        const secret: string = process.env.JWT_SECRET || 'secret';
        const expiresIn: string | number = process.env.JWT_EXPIRES_IN || '1d';

        const token = jwt.sign(
            { id: newUser.id, phone: newUser.phone, role: newUser.role },
            secret,
            { expiresIn: expiresIn as any }
        );

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: newUser.id,
                phone: newUser.phone,
                name: newUser.name,
                surname: newUser.surname,
                role: newUser.role
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { phone, password } = req.body;

        if (!phone || !password) {
            return res.status(400).json({ message: 'Phone and password are required' });
        }

        const user = await UserModel.findByPhone(phone);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const secret: string = process.env.JWT_SECRET || 'secret';
        const expiresIn: string | number = process.env.JWT_EXPIRES_IN || '1d';

        const token = jwt.sign(
            { id: user.id, phone: user.phone, role: user.role },
            secret,
            { expiresIn: expiresIn as any }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                phone: user.phone,
                name: user.name,
                surname: user.surname,
                role: user.role,
                avatar: user.avatar_url,
                username: user.name.toLowerCase().replace(/\s+/g, '_') + '_' + user.id.substring(0, 4)
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
