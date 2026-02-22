-- P2P Ads Table
CREATE TABLE IF NOT EXISTS p2p_ads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL CHECK (type IN ('buy', 'sell')),
    amount_mali DECIMAL(20, 8) NOT NULL CHECK (amount_mali > 0),
    price_uzs DECIMAL(20, 8) NOT NULL CHECK (price_uzs > 0), -- Price per 1/unit? Or fixed? Let's assume Price per 1 MALI.
    min_limit_uzs DECIMAL(20, 8), -- Min purchase/sell limit (optional)
    max_limit_uzs DECIMAL(20, 8), -- Max purchase/sell limit (optional)
    payment_methods JSONB DEFAULT '[]', -- Arguments for Card types etc.
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed', 'completed')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_p2p_ads_type ON p2p_ads(type);
CREATE INDEX IF NOT EXISTS idx_p2p_ads_status ON p2p_ads(status);
CREATE INDEX IF NOT EXISTS idx_p2p_ads_price ON p2p_ads(price_uzs);

-- P2P Trades (Transaction Instance)
CREATE TABLE IF NOT EXISTS p2p_trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ad_id UUID NOT NULL REFERENCES p2p_ads(id),
    buyer_id UUID NOT NULL REFERENCES users(id),
    seller_id UUID NOT NULL REFERENCES users(id),
    amount_mali DECIMAL(20, 8) NOT NULL,
    amount_uzs DECIMAL(20, 8) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'confirmed', 'dispute', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_p2p_trades_users ON p2p_trades(buyer_id, seller_id);
