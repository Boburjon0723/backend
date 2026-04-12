-- Allow session-level notes (guruh sessiya qaydi): client_id nullable, note_type for future use
ALTER TABLE specialist_notes
  ALTER COLUMN client_id DROP NOT NULL;

-- Optional: add note_type to distinguish client note vs session note
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'specialist_notes' AND column_name = 'note_type'
  ) THEN
    ALTER TABLE specialist_notes ADD COLUMN note_type VARCHAR(20) DEFAULT 'client';
  END IF;
END $$;

COMMENT ON COLUMN specialist_notes.client_id IS 'NULL for session/group notes; set for client-specific notes';
COMMENT ON COLUMN specialist_notes.note_type IS 'client = per-client note, session = group/session note';
