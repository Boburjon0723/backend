import { pool } from '../src/config/database';

async function testDelete() {
    const adId = 'd5b3ceee-61b8-4aea-8613-13280d600145';
    // const userId = ... (not easy to get here without a token)
    try {
        console.log('Testing update status for adId:', adId);
        const result = await pool.query(
            "UPDATE p2p_ads SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *",
            [adId]
        );
        console.log('Result:', result.rows);
    } catch (error) {
        console.error('Test Delete Error:', error);
    } finally {
        process.exit();
    }
}

testDelete();
