-- Public API support (ports novel-sanctuary's identical migration):
-- 1. api_keys table for the new `manga-api` edge function's own auth layer
--    (service-role gated inside the function; NOT Supabase auth/RLS-based,
--    since this API is meant for external agents/scripts, not logged-in
--    users). Only the SHA-256 hash of the key is ever stored.
-- 2. UNIQUE(manga_id, chapter_number) on chapters, needed for a real
--    upsert-on-conflict from the bulk chapter-attach endpoint.

CREATE TABLE IF NOT EXISTS manga_sanctuary.api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  key_hash     TEXT        NOT NULL UNIQUE,
  scope        TEXT        NOT NULL DEFAULT 'read' CHECK (scope IN ('read', 'write', 'admin')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON manga_sanctuary.api_keys (key_hash) WHERE revoked_at IS NULL;

ALTER TABLE manga_sanctuary.api_keys ENABLE ROW LEVEL SECURITY;
-- No policies added deliberately — this table is only ever touched via the
-- edge function's service-role key (which has the bypassrls attribute, so
-- RLS itself never blocks it). Enabling RLS with zero policies means even a
-- stray anon/authenticated request can never read or write it directly.
-- NOTE: bypassrls only skips RLS POLICIES — a role still needs an explicit
-- table-level GRANT to touch the table at all (confirmed as the failure mode
-- on novel-sanctuary's first deploy of this same migration).
GRANT SELECT, INSERT, UPDATE, DELETE ON manga_sanctuary.api_keys TO service_role;

-- This Postgres instance is shared across multiple apps (chapterhouse,
-- manga_sanctuary, novel_sanctuary schemas all coexist) — a bare
-- `pg_constraint WHERE conname = ...` existence check (no schema/table
-- qualification) matches ACROSS schemas by name alone (confirmed as the
-- exact bug novel-sanctuary hit with chapterhouse.chapters). Constraint
-- name made schema-specific (`ms_` prefix) and the existence check scoped
-- to conrelid, not name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'manga_sanctuary.chapters'::regclass AND contype = 'u'
  ) THEN
    ALTER TABLE manga_sanctuary.chapters
      ADD CONSTRAINT ms_chapters_manga_chapno_key UNIQUE (manga_id, chapter_number);
  END IF;
END $$;
