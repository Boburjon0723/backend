"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const health_routes_1 = __importDefault(require("./api/routes/health.routes"));
const auth_routes_1 = __importDefault(require("./api/routes/auth.routes"));
const token_routes_1 = __importDefault(require("./api/routes/token.routes"));
const service_routes_1 = __importDefault(require("./api/routes/service.routes"));
const escrow_routes_1 = __importDefault(require("./api/routes/escrow.routes"));
const video_routes_1 = __importDefault(require("./api/routes/video.routes"));
const user_routes_1 = __importDefault(require("./api/routes/user.routes"));
const app = (0, express_1.default)();
// Middleware
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cors_1.default)());
app.use((0, helmet_1.default)());
app.use((0, morgan_1.default)('dev'));
// Routes
app.use('/api', health_routes_1.default);
app.use('/api', auth_routes_1.default);
app.use('/api', token_routes_1.default);
app.use('/api', service_routes_1.default);
app.use('/api', escrow_routes_1.default);
app.use('/api', video_routes_1.default);
app.use('/api', user_routes_1.default);
// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});
exports.default = app;
