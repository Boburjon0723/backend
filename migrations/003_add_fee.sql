ALTER TABLE p2p_trades ADD COLUMN fee_amount DECIMAL(20, 8) DEFAULT 0;
ALTER TABLE platform_balance ADD COLUMN daily_volume DECIMAL(20, 8) DEFAULT 0;
