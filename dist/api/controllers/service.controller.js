"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listServices = exports.createService = void 0;
const Service_1 = require("../../models/postgres/Service");
const createService = async (req, res) => {
    try {
        const providerId = req.user.id;
        const { category, title, description, price_mali, duration_minutes } = req.body;
        if (!category || !title || !price_mali || !duration_minutes) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        const service = await Service_1.ServiceModel.create({
            provider_id: providerId,
            category,
            title,
            description,
            price_mali: parseFloat(price_mali),
            duration_minutes: parseInt(duration_minutes)
        });
        res.status(201).json({ message: 'Service created successfully', service });
    }
    catch (error) {
        console.error('Create service error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.createService = createService;
const listServices = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const services = await Service_1.ServiceModel.findAll(limit, offset);
        res.json(services);
    }
    catch (error) {
        console.error('List services error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.listServices = listServices;
