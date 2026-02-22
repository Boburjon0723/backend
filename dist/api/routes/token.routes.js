"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const token_controller_1 = require("../controllers/token.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/wallet/balance', auth_middleware_1.authenticateToken, token_controller_1.getBalance);
router.post('/wallet/transfer', auth_middleware_1.authenticateToken, token_controller_1.transfer);
exports.default = router;
