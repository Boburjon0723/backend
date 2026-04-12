const { Storage } = require('@google-cloud/storage');
const path = require('path');
require('dotenv').config();

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    serviceAccount = require(path.join(__dirname, 'serviceAccountKey.json'));
}

const storage = new Storage({
    projectId: serviceAccount.project_id,
    credentials: serviceAccount
});

async function listBuckets() {
    try {
        console.log('Listing buckets for project:', serviceAccount.project_id);
        const [buckets] = await storage.getBuckets();
        console.log('Available buckets:');
        buckets.forEach(bucket => {
            console.log(' - ', bucket.name);
        });
    } catch (err) {
        console.error('ERROR listing buckets:', err.message);
    }
}

listBuckets();
