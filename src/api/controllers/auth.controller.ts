import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../config/database';
import { UserModel } from '../../models/postgres/User';

const generateTokens = async (userId: string, phone: string, role: string, isExpert: boolean = false, name: string = '', surname: string = '') => {
    const accessTokenSecret = process.env.JWT_SECRET || 'secret';
    const refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'refresh_secret';

    const accessToken = jwt.sign(
        { id: userId, phone, role, isExpert, name, surname },
        accessTokenSecret,
        { expiresIn: (process.env.NEXT_PUBLIC_JWT_EXPIRES_IN || '1d') as any }
    );

    const refreshToken = jwt.sign(
        { id: userId },
        refreshTokenSecret,
        { expiresIn: (process.env.NEXT_PUBLIC_JWT_REFRESH_EXPIRES_IN || '7d') as any }
    );

    // Hash the refresh token before storing it for extra security
    const salt = await bcrypt.genSalt(10);
    const hashedRefreshToken = await bcrypt.hash(refreshToken, salt);

    await UserModel.update(userId, { refresh_token: hashedRefreshToken });

    return { accessToken, refreshToken };
};

const insertAdminLoginAudit = async (
    req: Request,
    params: {
        userId?: string | null;
        phoneOrEmail: string;
        success: boolean;
        reason: string;
    }
) => {
    try {
        const forwardedFor = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim();
        const ipAddress = forwardedFor || (req.ip || '').toString();
        const userAgent = (req.headers['user-agent'] as string | undefined) || null;

        await pool.query(
            `
            INSERT INTO admin_login_audit (user_id, phone_or_email, ip_address, user_agent, success, reason)
            VALUES ($1, $2, $3, $4, $5, $6)
        `,
            [
                params.userId || null,
                params.phoneOrEmail,
                ipAddress || null,
                userAgent,
                params.success,
                params.reason,
            ]
        );
    } catch (err) {
        console.error('[AdminLoginAudit] Failed to insert audit row:', (err as any)?.message || err);
    }
};

const generateResetCode = () => {
    const num = Math.floor(100000 + Math.random() * 900000); // 6-digit
    return String(num);
};

const generateTelegramLinkCode = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let linkCode = '';
    for (let i = 0; i < 6; i++) {
        linkCode += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return linkCode;
};

/** Backend → Telegram xizmati (parol tiklash yoki ro‘yxatdan keyingi OTP) */
async function sendOtpViaBot(chatId: number, code: string, purpose: 'reset' | 'registration'): Promise<void> {
    const botUrl = process.env.BOT_SERVICE_URL;
    const botControlToken = process.env.BOT_CONTROL_TOKEN;

    if (!botUrl || !botControlToken) {
        console.warn('BOT_SERVICE_URL or BOT_CONTROL_TOKEN is not set; cannot notify Telegram bot.');
        return;
    }

    const fetchImpl: any = (global as any).fetch;
    if (!fetchImpl) {
        console.warn('Global fetch is not available; cannot call bot service.');
        return;
    }

    const base = botUrl.replace(/\/+$/, '');
    const path = purpose === 'reset' ? 'send-reset-code' : 'send-registration-code';
    await fetchImpl(`${base}/internal/${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-bot-control-token': botControlToken,
        },
        body: JSON.stringify({ chatId, code }),
    });
}

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

        // Initialize wallet
        await pool.query('INSERT INTO token_balances (user_id, balance, locked_balance) VALUES ($1, 0, 0) ON CONFLICT DO NOTHING', [newUser.id]);

        // Profil uchun tug'ilgan yil (yoshdan): keyingi yil yosh avtomatik oshadi
        let birthdayStr: string | null = null;
        const ageNum = typeof age === 'number' ? age : parseInt(String(age), 10);
        if (!Number.isNaN(ageNum) && ageNum > 0 && ageNum < 120) {
            const birthYear = new Date().getFullYear() - ageNum;
            birthdayStr = `${birthYear}-01-01`;
            await pool.query(
                `INSERT INTO user_profiles (user_id, birthday) SELECT $1, $2::date WHERE NOT EXISTS (SELECT 1 FROM user_profiles WHERE user_id = $1)`,
                [newUser.id, birthdayStr]
            ).catch(() => {});
        }

        const linkCode = generateTelegramLinkCode();
        await pool.query('UPDATE users SET telegram_link_code = $1, phone_verified = TRUE WHERE id = $2', [
            linkCode,
            newUser.id,
        ]);

        res.status(201).json({
            message: 'Hisob muvaffaqiyatli yaratildi.',
            requiresTelegramVerification: false,
            user: {
                id: newUser.id,
                phone: newUser.phone,
                name: newUser.name,
                surname: newUser.surname,
                age: newUser.age,
                birthday: birthdayStr || undefined,
                role: newUser.role,
                is_expert: newUser.is_expert || false,
                isExpert: newUser.is_expert || false,
            },
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

        // Verification disabled

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            if (user.role === 'admin') {
                await insertAdminLoginAudit(req, {
                    userId: user.id,
                    phoneOrEmail: phone,
                    success: false,
                    reason: 'invalid_credentials',
                });
            }
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const { accessToken, refreshToken } = await generateTokens(user.id, user.phone, user.role, user.is_expert, user.name, user.surname);

        if (user.role === 'admin') {
            await insertAdminLoginAudit(req, {
                userId: user.id,
                phoneOrEmail: phone,
                success: true,
                reason: 'ok',
            });
        }

        res.json({
            message: 'Login successful',
            token: accessToken,
            refreshToken,
            user: {
                id: user.id,
                phone: user.phone,
                name: user.name,
                surname: user.surname,
                age: user.age,
                birthday: user.birthday,
                role: user.role,
                avatar: user.avatar_url,
                username: user.username || user.name?.toLowerCase().replace(/\s+/g, '_') + '_' + user.id.substring(0, 4),
                is_expert: user.is_expert || false,
                isExpert: user.is_expert || false,
                /** getExpertPanelMode (huquqshunos / psixolog / ustoz) uchun */
                profession: (user as any).profession ?? null,
                specialty: (user as any).specialty ?? null,
                bio_expert: (user as any).bio_expert ?? null,
                specialty_desc: (user as any).specialty_desc ?? null,
                expert_proposal: (user as any).expert_proposal ?? null,
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const linkTelegram = async (req: Request, res: Response) => {
    try {
        const { linkCode, chatId } = req.body as { linkCode?: string; chatId?: number };
        const linkTokenHeader = req.headers['x-bot-link-token'] as string | undefined;
        const expectedToken = process.env.BOT_LINK_TOKEN;

        if (!expectedToken || linkTokenHeader !== expectedToken) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        if (!linkCode || !chatId) {
            return res.status(400).json({ message: 'linkCode and chatId are required' });
        }

        const userRes = await pool.query('SELECT id, phone_verified FROM users WHERE telegram_link_code = $1', [
            linkCode,
        ]);
        const userRow = userRes.rows[0];

        if (!userRow) {
            return res.status(400).json({ message: 'Bog‘lash kodi noto‘g‘ri yoki muddati tugagan.' });
        }

        const needsPhoneOtp = userRow.phone_verified === false;

        await pool.query('UPDATE users SET telegram_chat_id = $1, telegram_link_code = NULL WHERE id = $2', [
            chatId,
            userRow.id,
        ]);

        if (needsPhoneOtp) {
            const code = generateResetCode();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
            await pool.query(
                `INSERT INTO phone_verification_codes (user_id, code, expires_at) VALUES ($1, $2, $3)`,
                [userRow.id, code, expiresAt]
            );
            try {
                await sendOtpViaBot(chatId, code, 'registration');
            } catch (err) {
                console.error('Failed to send registration OTP via bot:', err);
            }
        }

        return res.json({ success: true, needsPhoneOtp });
    } catch (error) {
        console.error('linkTelegram error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const startTelegramLink = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id as string | undefined;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // 6-razryadli harf/raqamli kod
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let linkCode = '';
        for (let i = 0; i < 6; i++) {
            linkCode += alphabet[Math.floor(Math.random() * alphabet.length)];
        }

        await pool.query('UPDATE users SET telegram_link_code = $1 WHERE id = $2', [linkCode, userId]);

        return res.json({ success: true, code: linkCode });
    } catch (error) {
        console.error('startTelegramLink error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const requestPasswordReset = async (req: Request, res: Response) => {
    try {
        const { phone } = req.body as { phone?: string };

        if (!phone) {
            return res.status(400).json({ message: 'Phone is required' });
        }

        const user = await UserModel.findByPhone(phone);
        if (!user) {
            // For security, don't reveal that user doesn't exist
            return res.status(200).json({ success: true });
        }

        if (!user.telegram_chat_id) {
            return res.status(400).json({ message: 'Ushbu akkaunt Telegram bilan bog‘lanmagan.' });
        }

        const code = generateResetCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await pool.query(
            `
            INSERT INTO password_reset_codes (user_id, code, expires_at)
            VALUES ($1, $2, $3)
        `,
            [user.id, code, expiresAt]
        );

        try {
            await sendOtpViaBot(Number(user.telegram_chat_id), code, 'reset');
        } catch (err) {
            console.error('Failed to call bot service for reset code:', err);
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('requestPasswordReset error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const confirmPasswordReset = async (req: Request, res: Response) => {
    try {
        const { phone, code, newPassword } = req.body as {
            phone?: string;
            code?: string;
            newPassword?: string;
        };

        if (!phone || !code || !newPassword) {
            return res.status(400).json({ message: 'Phone, code and newPassword are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'Parol uzunligi kamida 6 ta belgi bo‘lishi kerak.' });
        }

        const user = await UserModel.findByPhone(phone);
        if (!user) {
            return res.status(400).json({ message: 'Noto‘g‘ri kod yoki telefon raqam.' });
        }

        const now = new Date();
        const codeRes = await pool.query(
            `
            SELECT id, code, expires_at, is_used
            FROM password_reset_codes
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 1
        `,
            [user.id]
        );

        const latest = codeRes.rows[0];
        if (!latest) {
            return res.status(400).json({ message: 'Tasdiqlash kodi topilmadi. Iltimos, qayta urinib ko‘ring.' });
        }

        if (latest.is_used || latest.code !== code) {
            return res.status(400).json({ message: 'Noto‘g‘ri yoki allaqachon ishlatilgan kod.' });
        }

        if (new Date(latest.expires_at) < now) {
            return res.status(400).json({ message: 'Kod muddati tugagan. Yangi kod oling.' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);
        await pool.query('UPDATE password_reset_codes SET is_used = TRUE WHERE id = $1', [latest.id]);

        return res.json({ success: true });
    } catch (error) {
        console.error('confirmPasswordReset error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/** Ro‘yxatdan keyin Telegramga kelgan OTP ni tasdiqlash, keyin JWT beriladi */
export const verifyRegistrationPhone = async (req: Request, res: Response) => {
    try {
        const { phone, code } = req.body as { phone?: string; code?: string };

        if (!phone || !code) {
            return res.status(400).json({ message: 'Telefon va kod kerak.' });
        }

        const user = await UserModel.findByPhone(phone);
        if (!user) {
            return res.status(400).json({ message: 'Noto‘g‘ri ma’lumot.' });
        }

        if (user.phone_verified !== false) {
            return res.status(400).json({ message: 'Bu akkaunt allaqachon tasdiqlangan. Tizimga kiring.' });
        }

        const now = new Date();
        const codeRes = await pool.query(
            `
            SELECT id, code, expires_at, is_used
            FROM phone_verification_codes
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT 1
        `,
            [user.id]
        );

        const latest = codeRes.rows[0];
        if (!latest) {
            return res.status(400).json({ message: 'Tasdiqlash kodi topilmadi. Avval Telegramda hisobni bog‘lang.' });
        }

        if (latest.is_used || String(latest.code) !== String(code).trim()) {
            return res.status(400).json({ message: 'Noto‘g‘ri yoki ishlatilgan kod.' });
        }

        if (new Date(latest.expires_at) < now) {
            return res.status(400).json({ message: 'Kod muddati tugagan. «Kodni qayta yuborish» ni bosing.' });
        }

        await pool.query('UPDATE users SET phone_verified = TRUE WHERE id = $1', [user.id]);
        await pool.query('UPDATE phone_verification_codes SET is_used = TRUE WHERE id = $1', [latest.id]);

        const { accessToken, refreshToken } = await generateTokens(
            user.id,
            user.phone,
            user.role,
            user.is_expert,
            user.name,
            user.surname
        );

        return res.json({
            success: true,
            token: accessToken,
            refreshToken,
            user: {
                id: user.id,
                phone: user.phone,
                name: user.name,
                surname: user.surname,
                age: user.age,
                birthday: (user as any).birthday,
                role: user.role,
                is_expert: user.is_expert || false,
                isExpert: user.is_expert || false,
            },
        });
    } catch (error) {
        console.error('verifyRegistrationPhone error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/** Front: foydalanuvchi botga bog‘langanmi / OTP kutilmoqdami */
export const registrationLinkStatus = async (req: Request, res: Response) => {
    try {
        const { phone } = req.body as { phone?: string };

        if (!phone) {
            return res.status(400).json({ message: 'Telefon kerak.' });
        }

        const user = await UserModel.findByPhone(phone);
        if (!user) {
            return res.status(404).json({ message: 'Foydalanuvchi topilmadi.' });
        }

        if (user.phone_verified !== false) {
            return res.json({
                telegramLinked: !!user.telegram_chat_id,
                needsOtp: false,
                completed: true,
            });
        }

        return res.json({
            telegramLinked: !!user.telegram_chat_id,
            needsOtp: !!user.telegram_chat_id,
            completed: false,
        });
    } catch (error) {
        console.error('registrationLinkStatus error:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const resendRegistrationOtp = async (req: Request, res: Response) => {
    try {
        const { phone } = req.body as { phone?: string };

        if (!phone) {
            return res.status(400).json({ message: 'Telefon kerak.' });
        }

        const user = await UserModel.findByPhone(phone);
        if (!user || user.phone_verified !== false || !user.telegram_chat_id) {
            return res.status(400).json({ message: 'Kodni qayta yuborib bo‘lmaydi.' });
        }

        const code = generateResetCode();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await pool.query(
            `INSERT INTO phone_verification_codes (user_id, code, expires_at) VALUES ($1, $2, $3)`,
            [user.id, code, expiresAt]
        );

        try {
            await sendOtpViaBot(Number(user.telegram_chat_id), code, 'registration');
        } catch (err) {
            console.error('resendRegistrationOtp bot error:', err);
            return res.status(502).json({ message: 'Telegram orqali yuborishda xatolik. Keyinroq urinib ko‘ring.' });
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('resendRegistrationOtp error:', error);
        return res.status(500).json({ message: 'Internal server error' });
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

        const tokens = await generateTokens(user.id, user.phone, user.role, user.is_expert, user.name, user.surname);

        res.json({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken
        });
    } catch (error) {
        console.error('Refresh error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
