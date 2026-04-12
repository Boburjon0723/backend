import fs from 'fs';
import path from 'path';
import { pool } from '../src/config/database';

async function migrate() {
    const client = await pool.connect();
    try {
        console.log("Starting migration...");

        // Ensure migrations table exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL UNIQUE,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Get list of migration files
        const migrationsDir = path.join(__dirname, '../migrations');
        if (!fs.existsSync(migrationsDir)) {
            console.log("No migrations directory found.");
            return;
        }

        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

        // Get applied migrations
        const { rows: applied } = await client.query('SELECT name FROM migrations');
        const appliedNames = new Set(applied.map(r => r.name));

        for (const file of files) {
            if (!appliedNames.has(file)) {
                console.log(`Applying ${file}...`);
                const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

                await client.query('BEGIN');
                try {
                    await client.query(content);
                    await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
                    await client.query('COMMIT');
                    console.log(`Applied ${file}`);
                } catch (err) {
                    await client.query('ROLLBACK');
                    console.error(`Failed to apply ${file}:`, err);
                    process.exit(1);
                }
            } else {
                console.log(`Skipping ${file} (already applied)`);
            }
        }
        console.log("Migration complete.");
    } catch (err) {
        console.error("Migration error:", err);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
