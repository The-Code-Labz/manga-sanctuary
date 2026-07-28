-- In-app chapter reading: store scraped chapter text instead of only linking out.
ALTER TABLE novel_sanctuary.chapters ADD COLUMN IF NOT EXISTS content text NULL;
ALTER TABLE novel_sanctuary.chapters ADD COLUMN IF NOT EXISTS content_source text NULL;
ALTER TABLE novel_sanctuary.chapters ADD COLUMN IF NOT EXISTS content_fetched_at timestamptz NULL;
ALTER TABLE novel_sanctuary.chapters ADD COLUMN IF NOT EXISTS word_count integer NULL;
