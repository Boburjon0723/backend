-- 30 kalendar kunlik obuna: talaba bir marta to'laydi, 1 oy davomida ustozning barcha darslariga kirishi mumkin
CREATE TABLE IF NOT EXISTS student_mentor_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mentor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    amount_paid DECIMAL(20, 2) NOT NULL DEFAULT 0,
    transaction_id UUID REFERENCES transactions(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id, mentor_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_student_mentor ON student_mentor_subscriptions(student_id, mentor_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON student_mentor_subscriptions(expires_at);
COMMENT ON TABLE student_mentor_subscriptions IS 'Talaba 30 kunlik obuna — har dars uchun alohida to''lov emas';
