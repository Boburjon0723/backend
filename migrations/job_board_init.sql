-- Migration to create job_categories and update jobs table

-- 1. Create job_categories table
CREATE TABLE IF NOT EXISTS job_categories (
    id SERIAL PRIMARY KEY,
    name_uz VARCHAR(255) NOT NULL,
    name_ru VARCHAR(255) NOT NULL,
    icon VARCHAR(100), -- Lucide icon name or emoji
    is_active BOOLEAN DEFAULT TRUE,
    publication_price_mali DECIMAL(20, 4) DEFAULT 100.0000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Insert initial categories
INSERT INTO job_categories (name_uz, name_ru, icon, publication_price_mali) VALUES
('Huquqshunos (Yurist)', 'Юрист', 'Gavel', 150.0000),
('Psixolog', 'Психолог', 'HeartPulse', 100.0000),
('Repetitor (O‘qituvchi)', 'Репетитор', 'GraduationCap', 50.0000),
('Santexnik', 'Сантехник', 'Wrench', 30.0000),
('Elektrik', 'Электрик', 'Zap', 30.0000),
('Usta (Remontchi)', 'Мастер по ремонту', 'Hammer', 30.0000),
('Fotograf / Videograf', 'Фотограф / Видеограф', 'Camera', 80.0000),
('Avtomobil ustasi', 'Автомастер', 'Car', 40.0000),
('Buxgalter', 'Бухгалтер', 'Calculator', 120.0000),
('Hamshira / Qarovchi', 'Медсестра / Сиделка', 'Stethoscope', 40.0000);

-- 3. Update jobs table with specific fields
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sub_type VARCHAR(20) DEFAULT 'seeker'; -- 'seeker' or 'employer'
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES job_categories(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid'; -- 'unpaid', 'paid'
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS publication_fee DECIMAL(20, 4) DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS short_text TEXT;

-- Seeker specific fields
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS experience_years INTEGER;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_min DECIMAL(20, 4);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_salary_negotiable BOOLEAN DEFAULT TRUE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS skills_json JSONB;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS has_diploma BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS has_certificate BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS resume_url TEXT;

-- Employer specific fields
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS responsible_person VARCHAR(255);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_type VARCHAR(50); -- full-time, part-time, shift
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_hours VARCHAR(100);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS day_off VARCHAR(100);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS age_range VARCHAR(50);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS gender_pref VARCHAR(20);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS requirements_json JSONB;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS salary_text VARCHAR(255);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS benefits_json JSONB;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS apply_method_json JSONB;
