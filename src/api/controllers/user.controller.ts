import { Request, Response } from 'express';
import { pool } from '../../config/database';

export const getUsers = async (req: Request, res: Response) => {
    try {
        const result = await pool.query('SELECT id, name, surname, username, phone, avatar_url FROM users LIMIT 50');
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Get Users Error:', error);
        res.status(500).json({ message: 'Failed to fetch users' });
    }
};

export const getUserById = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        console.log('[getUserById] Request for userId:', userId);

        // UUID validation (Relaxed)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(userId as string)) {
            console.warn('[getUserById] Invalid UUID format received:', userId);
            return res.status(404).json({ message: 'Invalid user ID format' });
        }

        const result = await pool.query(`
            SELECT u.id, u.name, u.surname, u.email, u.phone, u.username, u.avatar_url,
                   p.bio, p.is_expert, p.profession, p.specialization, p.experience_years, 
                   p.service_price, p.working_hours, p.languages, p.verified_status,
                   p.wiloyat, p.tuman, p.specialization_details, p.has_diploma,
                   p.institution, p.current_workplace, p.diploma_url, p.certificate_url,
                   p.id_url, p.selfie_url, p.hourly_rate, p.currency, p.service_languages,
                   p.service_format, p.bio_expert, p.specialty_desc, p.services_json
            FROM users u
            LEFT JOIN user_profiles p ON u.id = p.user_id
            WHERE u.id = $1
        `, [userId]);

        if (result.rows.length === 0) {
            console.warn('[getUserById] User not found for ID:', userId);
            return res.status(404).json({ message: 'User not found' });
        }

        console.log('[getUserById] Success fetching details for:', userId);
        res.json(result.rows[0]);
    } catch (e: any) {
        console.error('[getUserById] DATABASE ERROR:', e);
        res.status(500).json({ message: 'Server error', details: e.message });
    }
};

export const getProfile = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.user.id;
        const result = await pool.query(`
            SELECT u.id, u.name, u.surname, u.email, u.phone, u.username, u.avatar_url,
                   p.bio, p.is_expert, p.profession, p.specialization, p.experience_years, 
                   p.service_price, p.working_hours, p.languages, p.verified_status,
                   p.wiloyat, p.tuman, p.specialization_details, p.has_diploma,
                   p.institution, p.current_workplace, p.diploma_url, p.certificate_url,
                   p.id_url, p.selfie_url, p.hourly_rate, p.currency, p.service_languages,
                   p.service_format, p.bio_expert, p.specialty_desc, p.services_json
            FROM users u
            LEFT JOIN user_profiles p ON u.id = p.user_id
            WHERE u.id = $1
        `, [userId]);

        if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });

        res.json(result.rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateProfile = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.user.id;
        const {
            name, surname, username, bio, avatar_url, birthday,
            is_expert, profession, specialization, experience_years,
            service_price, working_hours, languages, wiloyat, tuman,
            specialization_details, has_diploma, institution, current_workplace,
            diploma_url, certificate_url, id_url, selfie_url,
            hourly_rate, currency, service_languages, service_format,
            bio_expert, specialty_desc, services_json
        } = req.body;
        console.log('[updateProfile] Payload:', req.body);

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Check Username Uniqueness
            if (username) {
                const check = await client.query('SELECT id FROM users WHERE username = $1 AND id != $2', [username, userId]);
                if (check.rows.length > 0) {
                    throw new Error('Username already taken');
                }
            }

            // Update User Table
            await client.query(
                `UPDATE users SET name = COALESCE($1, name), surname = COALESCE($2, surname), username = COALESCE($3, username), avatar_url = COALESCE($4, avatar_url), updated_at = NOW() WHERE id = $5`,
                [name, surname, username, avatar_url, userId]
            );

            // Update Profile Table
            const profileRes = await client.query('SELECT * FROM user_profiles WHERE user_id = $1', [userId]);
            const existingProfile = profileRes.rows[0];

            if (is_expert === true) {
                // Basic validation for becoming an expert
                if (!profession || !specialization || !experience_years || !hourly_rate) {
                    throw new Error('Expert profiles require profession, specialization, experience, and hourly rate');
                }
            }

            if (!existingProfile) {
                await client.query(
                    `INSERT INTO user_profiles (
                        user_id, bio, is_expert, profession, specialization, 
                        experience_years, service_price, working_hours, languages,
                        wiloyat, tuman, verified_status, specialization_details,
                        has_diploma, institution, current_workplace, diploma_url,
                        certificate_url, id_url, selfie_url, hourly_rate, currency,
                        service_languages, service_format, bio_expert, specialty_desc,
                        services_json
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)`,
                    [
                        userId, bio || '', is_expert || false, profession || '', specialization || '',
                        experience_years || 0, service_price || 0, working_hours || '', languages || '',
                        wiloyat || '', tuman || '', is_expert ? 'pending' : 'none',
                        specialization_details || '', has_diploma || false, institution || '',
                        current_workplace || '', diploma_url || '', certificate_url || '',
                        id_url || '', selfie_url || '', hourly_rate || 0, currency || 'MALI',
                        service_languages || '', service_format || '', bio_expert || '',
                        specialty_desc || '', services_json || '[]'
                    ]
                );
            } else {
                // EXPERT RE-VERIFICATION LOGIC
                // If an approved expert changes their core credentials, reset to pending
                let newVerifiedStatus = existingProfile.verified_status;

                const criticalFieldsChanged =
                    (profession && profession !== existingProfile.profession) ||
                    (specialization && specialization !== existingProfile.specialization) ||
                    (specialization_details && specialization_details !== existingProfile.specialization_details) ||
                    (experience_years && parseInt(experience_years) !== parseInt(existingProfile.experience_years));

                if (is_expert === true && (existingProfile.verified_status === 'none' || existingProfile.verified_status === 'rejected' || existingProfile.verified_status === 'unverified' || !existingProfile.verified_status)) {
                    console.log(`[updateProfile] Setting expert ${userId} to pending (new, re-application, or migration)`);
                    newVerifiedStatus = 'pending';
                } else if (existingProfile.verified_status === 'approved' && criticalFieldsChanged) {
                    console.log(`[updateProfile] Resetting approved expert ${userId} to pending due to critical field changes`);
                    newVerifiedStatus = 'pending';
                }

                await client.query(
                    `UPDATE user_profiles SET 
                        bio = COALESCE($1, bio),
                        is_expert = COALESCE($2, is_expert),
                        profession = COALESCE($3, profession),
                        specialization = COALESCE($4, specialization),
                        experience_years = COALESCE($5, experience_years),
                        service_price = COALESCE($6, service_price),
                        working_hours = COALESCE($7, working_hours),
                        languages = COALESCE($8, languages),
                        wiloyat = COALESCE($9, wiloyat),
                        tuman = COALESCE($10, tuman),
                        verified_status = $11,
                        specialization_details = COALESCE($12, specialization_details),
                        has_diploma = COALESCE($13, has_diploma),
                        institution = COALESCE($14, institution),
                        current_workplace = COALESCE($15, current_workplace),
                        diploma_url = COALESCE($16, diploma_url),
                        certificate_url = COALESCE($17, certificate_url),
                        id_url = COALESCE($18, id_url),
                        selfie_url = COALESCE($19, selfie_url),
                        hourly_rate = COALESCE($20, hourly_rate),
                        currency = COALESCE($21, currency),
                        service_languages = COALESCE($22, service_languages),
                        service_format = COALESCE($23, service_format),
                        bio_expert = COALESCE($24, bio_expert),
                        specialty_desc = COALESCE($25, specialty_desc),
                        services_json = COALESCE($26, services_json)
                    WHERE user_id = $27`,
                    [
                        bio, is_expert, profession, specialization,
                        experience_years, service_price, working_hours, languages,
                        wiloyat, tuman, newVerifiedStatus, specialization_details,
                        has_diploma, institution, current_workplace, diploma_url,
                        certificate_url, id_url, selfie_url, hourly_rate, currency,
                        service_languages, service_format, bio_expert, specialty_desc,
                        services_json, userId
                    ]
                );
            }

            await client.query('COMMIT');
            console.log('[updateProfile] Success for user:', userId);

            // Broadcast profile update via Socket.IO
            const io = req.app.get('io');
            if (io) {
                io.emit('profile_updated', {
                    userId: userId,
                    avatar_url: avatar_url,
                    name: name,
                    surname: surname,
                    username: username
                });
            }

            res.json({ message: 'Profile updated successfully' });

        } catch (e: any) {
            console.error('[updateProfile] Transaction Error:', e);
            await client.query('ROLLBACK');
            res.status(400).json({ message: e.message || 'Transaction failed' });
        } finally {
            client.release();
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: 'Server error' });
    }
};

export const searchUsers = async (req: Request, res: Response) => {
    try {
        const { q, phone, expert, profession } = req.query;

        let query = `
            SELECT u.id, u.name, u.surname, u.username, u.avatar_url, u.phone,
                   p.is_expert, p.profession, p.service_price, p.rating
            FROM users u
            LEFT JOIN user_profiles p ON u.id = p.user_id
            WHERE 1=1
        `;
        const params: any[] = [];
        let pIndex = 1;

        // Strict phone search (priority)
        if (phone && typeof phone === 'string') {
            query += ` AND u.phone = $${pIndex}`;
            params.push(phone);
            pIndex++;
        } else if (q && typeof q === 'string' && q.length >= 2) {
            const queryStr = q.startsWith('@') ? q.substring(1) : q;
            if (/^\+?[0-9\s-]{5,}$/.test(queryStr)) {
                query += ` AND (u.phone ILIKE $${pIndex} OR u.username ILIKE $${pIndex})`;
            } else {
                query += ` AND (u.username ILIKE $${pIndex} OR u.name ILIKE $${pIndex} OR u.surname ILIKE $${pIndex})`;
            }
            params.push(`%${queryStr}%`);
            pIndex++;
        }

        if (expert === 'true') {
            query += ` AND p.is_expert = TRUE AND p.verified_status = 'approved'`;
        }

        if (profession) {
            query += ` AND p.profession ILIKE $${pIndex}`;
            params.push(`%${profession}%`);
            pIndex++;
        }

        query += ` LIMIT 20`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (e) {
        console.error('Search Users Error:', e);
        res.status(500).json({ message: 'Search failed' });
    }
};

export const addContact = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.user.id;
        const { contactUserId, name, surname } = req.body;

        if (!contactUserId) return res.status(400).json({ message: 'Contact user ID is required' });

        // UUID validation (Relaxed)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(contactUserId)) {
            console.warn(`[addContact] Invalid UUID received: ${contactUserId}`);
            return res.status(400).json({ message: 'Noto\'g\'ri foydalanuvchi ID formati' });
        }

        // Check if user exists
        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [contactUserId]);
        if (userCheck.rows.length === 0) return res.status(404).json({ message: 'User not found' });

        // Upsert contact (use ON CONFLICT to update name/surname if they exist)
        await pool.query(`
            INSERT INTO user_contacts (user_id, contact_user_id, custom_name, custom_surname)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, contact_user_id) 
            DO UPDATE SET 
                custom_name = EXCLUDED.custom_name,
                custom_surname = EXCLUDED.custom_surname
        `, [userId, contactUserId, name, surname]);

        console.log(`[addContact] User ${userId} added ${contactUserId} with custom name: ${name} ${surname}`);
        res.status(200).json({ message: 'Kontakt muvaffaqiyatli saqlandi (Faqat sizga ko\'rinadi)' });
    } catch (err) {
        console.error('Add Contact Error:', err);
        res.status(500).json({ message: 'Kontaktni qo\'shishda xato yuz berdi' });
    }
};

export const getContacts = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.user.id;

        const result = await pool.query(`
            SELECT uc.id as contact_id, uc.custom_name, uc.custom_surname,
                   u.id, u.name as original_name, u.surname as original_surname, 
                   u.username, u.avatar_url, u.phone
            FROM user_contacts uc
            JOIN users u ON uc.contact_user_id = u.id
            WHERE uc.user_id = $1
            ORDER BY uc.created_at DESC
        `, [userId]);

        // Map to standard user object but prioritize custom name if provided
        const enriched = result.rows.map(row => ({
            id: row.id,
            name: row.custom_name || row.original_name,
            surname: row.custom_surname || row.original_surname,
            username: row.username,
            avatar: row.avatar_url,
            phone: row.phone,
            status: 'offline' // For now, handle status in real-time if needed
        }));

        res.json(enriched);
    } catch (err) {
        console.error('Get Contacts Error:', err);
        res.status(500).json({ message: 'Failed to fetch contacts' });
    }
};

export const removeContact = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const userId = req.user.id;
        const { contactId } = req.params;

        if (!contactId) return res.status(400).json({ message: 'Contact user ID is required' });

        await pool.query(
            'DELETE FROM user_contacts WHERE user_id = $1 AND contact_user_id = $2',
            [userId, contactId]
        );

        console.log(`[removeContact] User ${userId} removed contact ${contactId}`);
        res.status(200).json({ message: 'Kontakt muvaffaqiyatli o\'chirildi' });
    } catch (err) {
        console.error('Remove Contact Error:', err);
        res.status(500).json({ message: 'Kontaktni o\'chirishda xato yuz berdi' });
    }
};
