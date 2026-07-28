-- =============================================================================
-- Manga Sanctuary — Manga-specific schema additions
-- Adds artist tracking, manga type, and page-level chapter support
-- on top of the existing novel_sanctuary schema.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Artists table (manga often has a separate author and artist)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS novel_sanctuary.artists (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  bio        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Manga-specific columns on the manga table
-- ---------------------------------------------------------------------------
ALTER TABLE novel_sanctuary.manga
  ADD COLUMN IF NOT EXISTS artist_id UUID REFERENCES novel_sanctuary.artists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manga_type TEXT DEFAULT 'Manga' CHECK (manga_type IN ('Manga', 'Manhwa', 'Manhua', 'Webtoon'));

-- Backfill existing rows to Manga so the CHECK never fails on nulls
UPDATE novel_sanctuary.manga SET manga_type = COALESCE(manga_type, 'Manga');

-- ---------------------------------------------------------------------------
-- 3. Chapter pages — normalized store for manga page images
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS novel_sanctuary.chapter_pages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id  UUID        NOT NULL REFERENCES novel_sanctuary.chapters(id) ON DELETE CASCADE,
  page_number INTEGER     NOT NULL,
  image_url   TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, page_number)
);

-- Convenience JSONB cache on chapters for apps that prefer a single row fetch
ALTER TABLE novel_sanctuary.chapters
  ADD COLUMN IF NOT EXISTS pages jsonb DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 4. Reading progress — page-level support for manga
-- ---------------------------------------------------------------------------
ALTER TABLE novel_sanctuary.reading_progress
  ADD COLUMN IF NOT EXISTS last_page_read INTEGER DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 5. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_manga_artist_id ON novel_sanctuary.manga(artist_id);
CREATE INDEX IF NOT EXISTS idx_manga_type       ON novel_sanctuary.manga(manga_type);
CREATE INDEX IF NOT EXISTS idx_chapter_pages    ON novel_sanctuary.chapter_pages(chapter_id, page_number);

-- ---------------------------------------------------------------------------
-- 6. Row Level Security for new tables
-- ---------------------------------------------------------------------------
ALTER TABLE novel_sanctuary.artists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE novel_sanctuary.chapter_pages ENABLE ROW LEVEL SECURITY;

-- artists: public read, authenticated insert, admin delete
CREATE POLICY "Artists are viewable by everyone"
  ON novel_sanctuary.artists FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert artists"
  ON novel_sanctuary.artists FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can delete artists"
  ON novel_sanctuary.artists FOR DELETE TO authenticated
  USING (novel_sanctuary.has_role(auth.uid(), 'admin'));

-- chapter_pages: public read, authenticated insert/update/delete (admin moderated)
CREATE POLICY "Chapter pages are viewable by everyone"
  ON novel_sanctuary.chapter_pages FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert chapter pages"
  ON novel_sanctuary.chapter_pages FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can update chapter pages"
  ON novel_sanctuary.chapter_pages FOR UPDATE TO authenticated
  USING  (novel_sanctuary.has_role(auth.uid(), 'admin'))
  WITH CHECK (novel_sanctuary.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete chapter pages"
  ON novel_sanctuary.chapter_pages FOR DELETE TO authenticated
  USING (novel_sanctuary.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 7. PostgREST grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON novel_sanctuary.artists, novel_sanctuary.chapter_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON novel_sanctuary.artists, novel_sanctuary.chapter_pages TO authenticated;

-- service_role already has ALL via prior migration, but re-grant defensively
GRANT ALL ON novel_sanctuary.artists, novel_sanctuary.chapter_pages TO service_role;
