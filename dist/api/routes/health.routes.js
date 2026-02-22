"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../../config/database");
const mongoose_1 = __importDefault(require("mongoose"));
const router = (0, express_1.Router)();
router.get('/health', async (req, res) => {
    const healthcheck = {
        uptime: process.uptime(),
        message: 'OK',
        timestamp: Date.now(),
        postgres: 'disconnected',
        mongo: 'disconnected',
    };
    try {
        // Check Postgres
        await database_1.pool.query('SELECT 1');
        healthcheck.postgres = 'connected';
    }
    catch (error) {
        healthcheck.postgres = 'error';
    }
    try {
        // Check Mongo
        if (mongoose_1.default.connection.readyState === 1) {
            healthcheck.mongo = 'connected';
        }
        else {
            healthcheck.mongo = 'disconnected';
        }
    }
    catch (error) {
        healthcheck.mongo = 'error';
    }
    res.send(healthcheck);
});
exports.default = router;
