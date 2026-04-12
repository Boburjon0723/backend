import { Router } from 'express';
import {
    register,
    login,
    refresh,
    linkTelegram,
    requestPasswordReset,
    confirmPasswordReset,
    startTelegramLink,
    verifyRegistrationPhone,
    registrationLinkStatus,
    resendRegistrationOtp,
} from '../controllers/auth.controller';
import { authLimiter } from '../../middleware/rateLimit.middleware';
import { authenticateToken } from '../../middleware/auth.middleware';

const router = Router();

router.post('/auth/register', authLimiter, register);
router.post('/auth/login', authLimiter, login);
router.post('/auth/refresh', refresh);

// Authenticated user asks for one-time Telegram link code
router.post('/auth/start-telegram-link', authenticateToken, startTelegramLink);
// Backward-compatible: Uzbek path variant used in logs
router.post('/auth/start-telegram-havolasi', authenticateToken, startTelegramLink);

// Called only by Telegram bot to link chat ID with user using link code
router.post('/auth/link-telegram', linkTelegram);

// Password reset flow (public, but rate-limited)
router.post('/auth/request-reset', authLimiter, requestPasswordReset);
router.post('/auth/confirm-reset', authLimiter, confirmPasswordReset);

// Ro‘yxatdan o‘tish: Telegram bog‘langach OTP va yakuniy tasdiqlash
router.post('/auth/registration-status', authLimiter, registrationLinkStatus);
router.post('/auth/verify-registration', authLimiter, verifyRegistrationPhone);
router.post('/auth/resend-registration-otp', authLimiter, resendRegistrationOtp);

export default router;
