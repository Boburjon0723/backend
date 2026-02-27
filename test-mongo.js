const mongoose = require('mongoose');
require('dotenv').config();

console.log('--- Mongo Connection Test Started ---');
console.log('URI (masked):', process.env.MONGODB_URI?.replace(/:[^:@]+@/, ':****@'));

const start = Date.now();
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ MONGO SUCCESS!');
        console.log('Time taken:', Date.now() - start, 'ms');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ MONGO FAILED');
        console.error(err);
        process.exit(1);
    });

setTimeout(() => {
    console.error('❌ MONGO TIMEOUT (30s)');
    process.exit(1);
}, 30000);
