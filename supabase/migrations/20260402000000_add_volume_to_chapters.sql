-- NOTE: novel_sanctuary.chapters already has volume_number/volume_title baked in
-- as of the 20260625000000 schema squash. This file is kept only for historical
-- pre-squash environments; IF NOT EXISTS makes it a no-op on current schema.
ALTER TABLE novel_sanctuary.chapters ADD COLUMN IF NOT EXISTS volume_number integer NULL;
ALTER TABLE novel_sanctuary.chapters ADD COLUMN IF NOT EXISTS volume_title text NULL;