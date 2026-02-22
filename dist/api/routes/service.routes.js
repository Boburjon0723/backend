"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const service_controller_1 = require("../controllers/service.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post('/services', auth_middleware_1.authenticateToken, service_controller_1.createService);
router.get('/services', service_controller_1.listServices);
exports.default = router;
