-- "Continue Reading": reading_progress already tracks last_chapter_read as a
-- bare chapter_number, which is ambiguous once a manga has volumes (chapter
-- numbering can repeat across volumes, e.g. Vol.1 Ch.1 and Vol.2 Ch.1). Add a
-- direct FK to the exact chapter row so the reader can navigate straight to
-- it without a number-lookup, while keeping last_chapter_read for display.
-- Ported from novel-sanctuary's 20260731000000_add_reading_progress_chapter_id.
ALTER TABLE manga_sanctuary.reading_progress
  ADD COLUMN IF NOT EXISTS last_chapter_id UUID NULL
  REFERENCES manga_sanctuary.chapters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS reading_progress_last_chapter_id_idx
  ON manga_sanctuary.reading_progress (last_chapter_id);

NOTIFY pgrst, 'reload schema';
