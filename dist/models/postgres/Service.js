"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceModel = void 0;
const database_1 = require("../../config/database");
exports.ServiceModel = {
    async create(data) {
        const query = `
      INSERT INTO services (
        provider_id, category, title, description, price_mali, duration_minutes
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
        const values = [
            data.provider_id,
            data.category,
            data.title,
            data.description,
            data.price_mali,
            data.duration_minutes
        ];
        const result = await database_1.pool.query(query, values);
        return result.rows[0];
    },
    async findById(id) {
        const query = 'SELECT * FROM services WHERE id = $1';
        const result = await database_1.pool.query(query, [id]);
        return result.rows[0] || null;
    },
    async findAll(limit = 20, offset = 0) {
        const query = 'SELECT * FROM services WHERE is_active = TRUE ORDER BY created_at DESC LIMIT $1 OFFSET $2';
        const result = await database_1.pool.query(query, [limit, offset]);
        return result.rows;
    }
};
