-- platform_settings (key, value) sxemasidan (id, expert_subscription_fee, commission_rate) ga o'tkazish
-- "column id does not exist" xatosini bartaraf etish uchun

DO $$
BEGIN
    -- Agar platform_settingsda id ustuni yo'q bo'lsa (key/value sxema)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'platform_settings' AND column_name = 'id'
    ) THEN
        -- Yangi jadval yaratish (vaqtincha)
        CREATE TABLE IF NOT EXISTS platform_settings_new (
            id SERIAL PRIMARY KEY,
            expert_subscription_fee DECIMAL(10,2) DEFAULT 20.00,
            commission_rate DECIMAL(4,2) DEFAULT 0.10,
            desktop_download_url TEXT,
            desktop_version VARCHAR(20),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Eski ma'lumotlardan transfer_fee ni commission_rate ga o'tkazish (agar bo'lsa)
        INSERT INTO platform_settings_new (id, expert_subscription_fee, commission_rate)
        VALUES (1, 20.00, 0.10);
        
        -- Eski jadvalni o'chirish va yangisini almashtirish
        DROP TABLE IF EXISTS platform_settings;
        ALTER TABLE platform_settings_new RENAME TO platform_settings;
        
        RAISE NOTICE 'platform_settings migratsiya qilindi (key/value -> id schema)';
    END IF;
END $$;
