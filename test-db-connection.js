
const dotenv = require('dotenv');
const { Pool } = require('pg');
dotenv.config();

console.log('PORT:', process.env.PORT);
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'EXISTS' : 'MISSING');

if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.connect()
        .then(client => {
            console.log('Postgres connection SUCCESS');
            client.release();
            process.exit(0);
        })
        .catch(err => {
            console.error('Postgres connection FAILED:', err.message);
            process.exit(1);
        });
} else {
    console.log('No DATABASE_URL found.');
    process.exit(1);
}
