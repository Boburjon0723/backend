import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function seedExpert(username: string, profession: string, spec: string) {
    try {
        let userId: string;
        const userRes = await pool.query('SELECT id, name FROM users WHERE username = $1', [username]);
        if (userRes.rows.length === 0) {
            console.log(`User yaratilmoqda: ${username}`);
            // If user doesn't exist, create one (mock password)
            const insertRes = await pool.query(
                'INSERT INTO users (id, name, username, email, phone, password_hash) VALUES (gen_random_uuid(), $1::text, $2::text, $3::text, $4::text, \'hash\') RETURNING id',
                [username, username, username + '@mail.com', '+998' + Math.floor(Math.random() * 9000000 + 1000000)]
            );
            userId = insertRes.rows[0].id;
        } else {
            userId = userRes.rows[0].id;
        }

        const expertData = {
            bio: `${username} - professional mutaxassis.`,
            is_expert: true,
            profession: profession,
            specialization_details: spec,
            experience_years: Math.floor(Math.random() * 15) + 1,
            has_diploma: true,
            institution: 'Oliy Ma\'lumotli Muassasa',
            current_workplace: 'Mali Group',
            hourly_rate: Math.floor(Math.random() * 100000) + 50000,
            currency: 'MALI',
            service_languages: 'O‘zbek, Rus',
            service_format: 'Online, Video',
            bio_expert: `Salom, men ${username}. O'z sohamda professionalman.`,
            specialty_desc: spec + ' bo\'yicha xizmatlar ko\'rsataman.',
            verified_status: 'approved',
            services_json: JSON.stringify([{ id: 1, title: 'Konsultatsiya', price: 50000 }])
        };

        await pool.query('BEGIN');
        const query = `
            INSERT INTO user_profiles (
                user_id, bio, is_expert, profession, specialization_details, 
                experience_years, has_diploma, institution, current_workplace,
                hourly_rate, currency, service_languages, service_format,
                bio_expert, specialty_desc, verified_status, services_json
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (user_id) DO UPDATE SET
                bio = EXCLUDED.bio, is_expert = true, profession = EXCLUDED.profession,
                specialization_details = EXCLUDED.specialization_details,
                experience_years = EXCLUDED.experience_years, verified_status = 'approved',
                has_diploma = EXCLUDED.has_diploma, institution = EXCLUDED.institution,
                current_workplace = EXCLUDED.current_workplace, hourly_rate = EXCLUDED.hourly_rate,
                currency = EXCLUDED.currency, service_languages = EXCLUDED.service_languages,
                service_format = EXCLUDED.service_format, bio_expert = EXCLUDED.bio_expert,
                specialty_desc = EXCLUDED.specialty_desc, services_json = EXCLUDED.services_json;
        `;
        await pool.query(query, [
            userId, expertData.bio, true, expertData.profession, expertData.specialization_details,
            expertData.experience_years, expertData.has_diploma, expertData.institution, expertData.current_workplace,
            expertData.hourly_rate, expertData.currency, expertData.service_languages, expertData.service_format,
            expertData.bio_expert, expertData.specialty_desc, expertData.verified_status, expertData.services_json
        ]);
        await pool.query('COMMIT');
        console.log(`✅ ${username} (${profession}) tasdiqlandi.`);
    } catch (e) {
        console.error(e);
    }
}

async function runSeeding() {
    await seedExpert('admin', 'Klinik psixolog', 'Ruhiy salomatlik va profilaktika');
    await seedExpert('odil_d17d', 'Advokat', 'Fuqarolik va jinoyat huquqi');
    await seedExpert('user1', 'Dasturchi mentor', 'Frontend va Backend yo\'nalishlari');
    await seedExpert('user2', 'Biznes konsultant', 'Startaplar uchun strategiyalar');
    await pool.end();
}

runSeeding();
