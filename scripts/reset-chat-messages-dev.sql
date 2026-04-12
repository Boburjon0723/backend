-- DEV / test: barcha chat xabarlarini serverdan o‘chirish (chatlar va ishtirokchilar qoladi).
-- Ishga tushirishdan oldin zaxira oling.
-- psql: \i backend/scripts/reset-chat-messages-dev.sql

DELETE FROM messages;
