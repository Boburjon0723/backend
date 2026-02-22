-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    surname VARCHAR(255),
    age INTEGER,
    role VARCHAR(50) DEFAULT 'user', -- 'user', 'admin'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Token Balances Table
CREATE TABLE IF NOT EXISTS token_balances (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance DECIMAL(20, 4) DEFAULT 0.0000,
    locked_balance DECIMAL(20, 4) DEFAULT 0.0000,
    lifetime_earned DECIMAL(20, 4) DEFAULT 0.0000,
    lifetime_spent DECIMAL(20, 4) DEFAULT 0.0000,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Platform Balance Table (Single Row)
CREATE TABLE IF NOT EXISTS platform_balance (
    id SERIAL PRIMARY KEY,
    balance DECIMAL(20, 4) DEFAULT 0.0000,
    total_fees_collected DECIMAL(20, 4) DEFAULT 0.0000,
    total_commissions_collected DECIMAL(20, 4) DEFAULT 0.0000,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Initialize Platform Balance
INSERT INTO platform_balance (id, balance) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

-- 4. Services Table
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_id UUID REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL, -- 'psychologist', 'lawyer', etc.
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price_mali DECIMAL(20, 4) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    rating DECIMAL(3, 2) DEFAULT 0.00,
    total_bookings INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Escrow Table
CREATE TABLE IF NOT EXISTS escrow (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Payer
    service_id UUID REFERENCES services(id) ON DELETE SET NULL,
    booking_id UUID, -- Optional link if you have a booking table later
    amount DECIMAL(20, 4) NOT NULL,
    status VARCHAR(50) DEFAULT 'held', -- 'held', 'released', 'refunded'
    held_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP WITH TIME ZONE,
    refunded_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB
);

-- 6. Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
    receiver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    amount DECIMAL(20, 4) NOT NULL,
    fee DECIMAL(20, 4) DEFAULT 0,
    net_amount DECIMAL(20, 4) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'transfer', 'escrow_hold', 'escrow_release', 'commission', etc.
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    reference_type VARCHAR(50), -- 'escrow', 'order'
    reference_id UUID,
    note TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Sessions Table (Video)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id UUID REFERENCES services(id),
    provider_id UUID REFERENCES users(id),
    client_id UUID REFERENCES users(id),
    escrow_id UUID REFERENCES escrow(id),
    video_url TEXT NOT NULL,
    platform VARCHAR(50) DEFAULT 'jitsi',
    status VARCHAR(50) DEFAULT 'scheduled', -- 'active', 'completed'
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to update updated_at columns
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_token_balances_modtime
    BEFORE UPDATE ON token_balances
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_services_modtime
    BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
-- 8. User Contacts Table
CREATE TABLE IF NOT EXISTS user_contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    contact_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    custom_name VARCHAR(255),
    custom_surname VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, contact_user_id)
);
