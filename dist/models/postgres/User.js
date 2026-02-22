"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModel = void 0;
const database_1 = require("../../config/database");
exports.UserModel = {
    async findByEmail(email) {
        const query = 'SELECT * FROM users WHERE email = $1';
        const result = await database_1.pool.query(query, [email]);
        return result.rows[0] || null;
    },
    async create(email, passwordHash, name) {
        const query = `
      INSERT INTO users (email, password_hash, name)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
        const result = await database_1.pool.query(query, [email, passwordHash, name]);
        return result.rows[0];
    },
    async findById(id) {
        const query = 'SELECT * FROM users WHERE id = $1';
        const result = await database_1.pool.query(query, [id]);
        return result.rows[0] || null;
    },
    async update(id, data) {
        // Construct dynamic update query
        const fields = [];
        const values = [];
        let idx = 1;
        if (data.name) {
            fields.push(`name = $${idx++}`);
            values.push(data.name);
        }
        if (data.username) { // Assuming DB has username field, if not it might error, but let's try
            fields.push(`username = $${idx++}`);
            values.push(data.username);
        }
        // if (data.bio) { ... } // Add bio if schema supports it
        if (fields.length === 0)
            return null;
        values.push(id);
        const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`;
        try {
            const result = await database_1.pool.query(query, values);
            return result.rows[0] || null;
        }
        catch (e) {
            console.error("DB Update Error:", e);
            throw e;
        }
    },
    async findAll() {
        const query = 'SELECT id, email, name, role, created_at FROM users LIMIT 50'; // Limit for safety
        const result = await database_1.pool.query(query);
        return result.rows;
    }
};
