import * as admin from 'firebase-admin';
import path from 'path';

let serviceAccount: any;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (err) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable:', err);
    }
}

if (!serviceAccount) {
    try {
        serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));
    } catch (err) {
        console.warn('Firebase service account key file not found. Falling back to environment variables.');
    }
}

if (!admin.apps.length && serviceAccount) {
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.firebasestorage.app`;
    
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: bucketName
    });
    console.log(`[Firebase] Initialized with bucket: ${bucketName}`);
}

export const bucket = admin.storage().bucket();
export const db = admin.firestore();
export default admin;
