"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const video_controller_1 = require("../controllers/video.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post('/sessions/start', auth_middleware_1.authenticateToken, video_controller_1.startSession);
router.post('/sessions/end', auth_middleware_1.authenticateToken, video_controller_1.endSession);
exports.default = router;
