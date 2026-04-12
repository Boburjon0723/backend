import rateLimit from 'express-rate-limit';

// Global rate limiter
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per `window`
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
        message: 'Juda ko\'p so\'rov yuborildi. Iltimos, 15 daqiqadan so\'ng qayta urinib ko\'ring.'
    }
});

// Stepped limiter for auth routes
export const authLimiter = rateLimit({
    // 5 daqiqada 50 ta urinishgacha ruxsat beramiz (dev/test uchun yumshatilgan limit)
    windowMs: 5 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: 'Login yoki ro\'yxatdan o\'tish urinishlari juda ko\'p. Birozdan so\'ng qayta urining.'
    }
});
