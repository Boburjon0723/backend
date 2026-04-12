-- Barcha chat xabarlarini o‘chirish (test / tozalash).
-- PostgreSQL: suhbatlar (chats) va ishtirokchilar o‘zgarmaydi.
-- parent_id o‘z-o‘ziga bog‘langan bo‘lsa, avval bog‘lanishni uzish xavfsiz.

BEGIN;

UPDATE messages SET parent_id = NULL WHERE parent_id IS NOT NULL;

DELETE FROM messages;

COMMIT;
