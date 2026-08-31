-- ---------------------------------------------------------------------------
-- Search performance + alt-titles search
--
-- Root cause of the slow Search page: useMangaList() pulled the ENTIRE
-- approved catalog (every manga row, with nested joins for authors, genres,
-- tags, every chapter id, every rating row, every reading_progress row) to
-- the browser on every mount, then SearchPage.tsx filtered the whole array
-- client-side on every keystroke. That only gets slower as the catalog
-- grows, and the client filter only ever checked n.title/n.author_name —
-- alt_titles (JP/romanji/native names, already imported via
-- manga-metadata-v2) was never searched at all.
--
-- Fix: move search+filter+pagination server-side via a single indexed RPC.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- array_to_string(anyarray, text) is catalogued STABLE, not IMMUTABLE
-- (confirmed via pg_proc.provolatile) -- Postgres generated STORED columns
-- require every function in the expression to be IMMUTABLE, which is the
-- exact cause of "generation expression is not immutable" (42P17) here.
-- Wrap it in a trivial SQL function explicitly marked IMMUTABLE: safe to
-- assert since array_to_string over a text[] has no locale/timezone/catalog
-- dependency -- Postgres just never bothered marking the builtin that way.
CREATE OR REPLACE FUNCTION manga_sanctuary.immutable_array_to_string(arr TEXT[], sep TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT array_to_string(arr, sep) $$;

-- Precomputed, lowercased "title + all alt titles" blob so search doesn't
-- lower()/concat() per row at query time, and so a single trigram index
-- covers both the primary title and every alternative title at once.
ALTER TABLE manga_sanctuary.manga
  ADD COLUMN IF NOT EXISTS search_blob TEXT GENERATED ALWAYS AS (
    lower(title || ' ' || manga_sanctuary.immutable_array_to_string(coalesce(alt_titles, '{}'), ' '))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_manga_search_blob_trgm
  ON manga_sanctuary.manga USING gin (search_blob gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_authors_name_trgm
  ON manga_sanctuary.authors USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_manga_approved_created
  ON manga_sanctuary.manga (is_approved, created_at DESC)
  WHERE is_approved = true;

-- Paginated search/filter RPC — replaces "fetch everything, filter in JS".
-- Genres/tags/rating/chapter_count are aggregated per-row via indexed
-- lateral lookups (cheap: each hits a FK-indexed join, not a full scan)
-- instead of dragging every ratings/reading_progress row for the whole
-- catalog over the wire like the old fetchManga() did.
CREATE OR REPLACE FUNCTION manga_sanctuary.search_manga(
  q             TEXT    DEFAULT NULL,
  genre_filter  TEXT[]  DEFAULT NULL,
  tag_filter    TEXT[]  DEFAULT NULL,
  lang_filter   TEXT[]  DEFAULT NULL,
  type_filter   TEXT    DEFAULT NULL,
  status_filter TEXT    DEFAULT NULL,
  page_limit    INT     DEFAULT 30,
  page_offset   INT     DEFAULT 0
)
RETURNS TABLE (
  id            UUID,
  title         TEXT,
  alt_titles    TEXT[],
  description   TEXT,
  author_id     UUID,
  author_name   TEXT,
  language      TEXT,
  status        TEXT,
  manga_type    manga_sanctuary.manga_type,
  cover_url     TEXT,
  genres        TEXT[],
  tags          TEXT[],
  rating        NUMERIC,
  rating_count  INT,
  chapter_count INT,
  created_at    TIMESTAMPTZ,
  total_count   BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    m.id, m.title, m.alt_titles, m.description, m.author_id,
    COALESCE(a.name, 'Unknown') AS author_name,
    m.language, m.status, m.manga_type, m.cover_url,
    COALESCE(g.names, '{}') AS genres,
    COALESCE(t.names, '{}') AS tags,
    COALESCE(r.avg_rating, 0) AS rating,
    COALESCE(r.cnt, 0)::INT AS rating_count,
    COALESCE(c.cnt, 0)::INT AS chapter_count,
    m.created_at,
    count(*) OVER() AS total_count
  FROM manga_sanctuary.manga m
  LEFT JOIN manga_sanctuary.authors a ON a.id = m.author_id
  LEFT JOIN LATERAL (
    SELECT array_agg(g2.name) AS names
    FROM manga_sanctuary.manga_genres mg
    JOIN manga_sanctuary.genres g2 ON g2.id = mg.genre_id
    WHERE mg.manga_id = m.id
  ) g ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(t2.name) AS names
    FROM manga_sanctuary.manga_tags mt
    JOIN manga_sanctuary.tags t2 ON t2.id = mt.tag_id
    WHERE mt.manga_id = m.id
  ) t ON true
  LEFT JOIN LATERAL (
    SELECT avg(rating)::numeric(3,1) AS avg_rating, count(*) AS cnt
    FROM manga_sanctuary.ratings WHERE manga_id = m.id
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM manga_sanctuary.chapters WHERE manga_id = m.id
  ) c ON true
  WHERE m.is_approved = true
    AND (
      q IS NULL OR q = ''
      OR m.search_blob ILIKE '%' || lower(q) || '%'
      OR a.name ILIKE '%' || q || '%'
    )
    AND (
      genre_filter IS NULL OR array_length(genre_filter, 1) IS NULL
      OR EXISTS (
        SELECT 1 FROM manga_sanctuary.manga_genres mg2
        JOIN manga_sanctuary.genres g3 ON g3.id = mg2.genre_id
        WHERE mg2.manga_id = m.id AND g3.name = ANY(genre_filter)
      )
    )
    AND (
      tag_filter IS NULL OR array_length(tag_filter, 1) IS NULL
      OR EXISTS (
        SELECT 1 FROM manga_sanctuary.manga_tags mt2
        JOIN manga_sanctuary.tags t3 ON t3.id = mt2.tag_id
        WHERE mt2.manga_id = m.id AND t3.name = ANY(tag_filter)
      )
    )
    AND (lang_filter IS NULL OR array_length(lang_filter, 1) IS NULL OR m.language = ANY(lang_filter))
    AND (type_filter IS NULL OR type_filter = '' OR m.manga_type::text = type_filter)
    AND (status_filter IS NULL OR status_filter = '' OR m.status = status_filter)
  ORDER BY m.created_at DESC
  LIMIT page_limit OFFSET page_offset
$$;

GRANT EXECUTE ON FUNCTION manga_sanctuary.search_manga(
  TEXT, TEXT[], TEXT[], TEXT[], TEXT, TEXT, INT, INT
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
