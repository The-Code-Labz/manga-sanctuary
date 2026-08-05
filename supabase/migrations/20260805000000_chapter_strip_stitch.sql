-- Async long-strip stitching support for chapters that exceed the edge
-- function's synchronous CPU-time budget (see manga-chapter-content /
-- manga-chapter-stitch Kestra flow).

ALTER TABLE manga_sanctuary.chapters
  ADD COLUMN strip_url     TEXT,
  ADD COLUMN stitch_status TEXT NOT NULL DEFAULT 'none'
    CHECK (stitch_status IN ('none', 'processing', 'ready', 'failed'));

COMMENT ON COLUMN manga_sanctuary.chapters.strip_url IS
  'Public URL of the single stitched long-strip image, populated by the manga-chapter-stitch Kestra flow.';
COMMENT ON COLUMN manga_sanctuary.chapters.stitch_status IS
  'none = never attempted (small chapter, or not yet fetched); processing = stitch flow triggered; ready = strip_url is live; failed = stitch flow errored, fall back to pages array.';

-- PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
