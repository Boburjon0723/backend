-- messages.created_at NULL bo‘lgan qatorlarni to‘ldirish (API null qaytarmasligi uchun).
-- Ishga tushirishdan oldin zaxira.
-- psql: \i backend/scripts/backfill-messages-created-at-null.sql

UPDATE messages
SET created_at = CURRENT_TIMESTAMP
WHERE created_at IS NULL;
