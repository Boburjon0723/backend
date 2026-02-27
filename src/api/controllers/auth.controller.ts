import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserModel } from '../../models/postgres/User';

const generateTokens = async (userId: string, phone: string, role: string) => {
    const accessTokenSecret = process.env.JWT_SECRET || 'secret';
    const refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'refresh_secret';

    const accessToken = jwt.sign(
        { id: userId, phone, role },
        accessTokenSecret,
        { expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as any }
    );

    const refreshToken = jwt.sign(
        { id: userId },
        refreshTokenSecret,
        { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any }
    );

    // Hash the refresh token before storing it for extra security
    const salt = await bcrypt.genSalt(10);
    const hashedRefreshToken = await bcrypt.hash(refreshToken, salt);

    await UserModel.update(userId, { refresh_token: hashedRefreshToken });

    return { accessToken, refreshToken };
};

export const register = async (req: Request, res: Response) => {
    try {
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

        const { accessToken, refreshToken } = await generateTokens(newUser.id, newUser.phone, newUser.role);

        res.status(201).json({
            message: 'User registered successfully',
            token: accessToken,
            refreshToken,
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

        console.log(`[AUTH] Login attempt for phone: ${phone}`);
        const user = await UserModel.findByPhone(phone);
        console.log(`[AUTH] User lookup result: ${user ? 'FOUND' : 'NOT FOUND'}`);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const { accessToken, refreshToken } = await generateTokens(user.id, user.phone, user.role);

        res.json({
            message: 'Login successful',
            token: accessToken,
            refreshToken,
            user: {
                id: user.id,
                phone: user.phone,
                name: user.name,
                surname: user.surname,
                role: user.role,
                avatar: user.avatar_url,
                username: user.username || user.name.toLowerCase().replace(/\s+/g, '_') + '_' + user.id.substring(0, 4)
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const refresh = async (req: Request, res: Response) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ message: 'Refresh token is required' });
        }

        const refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'refresh_secret';

        let decoded: any;
        try {
            decoded = jwt.verify(refreshToken, refreshTokenSecret);
        } catch (err) {
            return res.status(403).json({ message: 'Invalid refresh token' });
        }

        const user = await UserModel.findById(decoded.id);
        if (!user || !user.refresh_token) {
            return res.status(403).json({ message: 'Token expired or invalid' });
        }

        const isMatch = await bcrypt.compare(refreshToken, user.refresh_token);
        if (!isMatch) {
            return res.status(403).json({ message: 'Token rotation detected or invalid' });
        }

        const tokens = await generateTokens(user.id, user.phone, user.role);

        res.json({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (error) {
        console.error('Refresh error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
