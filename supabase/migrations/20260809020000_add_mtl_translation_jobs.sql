-- Machine translation (MTL) job tracking for JP/CN/KR raw chapters — per
-- the "Manga Sanctuary — Machine Image Translation (MTL) Handoff" spec.
-- Mirrors doujin-sanctuary's identical job model 1:1 (same shared external
-- MTL worker serves both apps — see manga-translate-chapter edge function).
--
-- translated pages are their OWN rows (translation_job_pages), never
-- overwriting chapters.pages/chapter_pages — the reader toggles between
-- the two sets, it doesn't mutate the original scan.

CREATE TABLE IF NOT EXISTS manga_sanctuary.translation_jobs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id   UUID        NOT NULL REFERENCES manga_sanctuary.chapters(id) ON DELETE CASCADE,
  source_lang  TEXT        NOT NULL,             -- ja | zh | ko (normalized at the edge boundary from manga.language JP/CN/KR)
  target_lang  TEXT        NOT NULL DEFAULT 'en',
  status       TEXT        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  engine       TEXT,
  progress     NUMERIC     NOT NULL DEFAULT 0,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, target_lang)
);

CREATE TABLE IF NOT EXISTS manga_sanctuary.translation_job_pages (
  job_id         UUID    NOT NULL REFERENCES manga_sanctuary.translation_jobs(id) ON DELETE CASCADE,
  page_number    INT     NOT NULL,
  source_url     TEXT    NOT NULL,
  translated_url TEXT,
  status         TEXT    NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  error          TEXT,
  PRIMARY KEY (job_id, page_number)
);

CREATE INDEX IF NOT EXISTS idx_translation_jobs_chapter ON manga_sanctuary.translation_jobs (chapter_id);
CREATE INDEX IF NOT EXISTS idx_translation_job_pages_job ON manga_sanctuary.translation_job_pages (job_id);

ALTER TABLE manga_sanctuary.translation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.translation_job_pages ENABLE ROW LEVEL SECURITY;

-- Everyone can READ job status (reader UI polls progress as an anon/authed
-- user) but only the service-role (manga-translate-chapter edge function,
-- and the worker's webhook callback) can write. New tables don't inherit
-- service_role's default grants on this self-hosted instance (same gotcha
-- hit on api_keys/api_request_logs) — explicit GRANT required.
CREATE POLICY "Anyone can view translation job status"
  ON manga_sanctuary.translation_jobs FOR SELECT USING (true);
CREATE POLICY "Anyone can view translation job page status"
  ON manga_sanctuary.translation_job_pages FOR SELECT USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON manga_sanctuary.translation_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON manga_sanctuary.translation_job_pages TO service_role;
GRANT SELECT ON manga_sanctuary.translation_jobs TO anon, authenticated;
GRANT SELECT ON manga_sanctuary.translation_job_pages TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
