-- Request log for the public manga-api edge function, feeding the admin
-- "API Dashboard" tab. Same access pattern as api_keys: RLS enabled with
-- ZERO policies (only the edge function's service-role key can touch it).
--
-- key_name is a denormalized snapshot (not just api_key_id) so historical
-- logs stay readable/attributable even after a key is later renamed or its
-- row is hard-deleted.

CREATE TABLE IF NOT EXISTS manga_sanctuary.api_request_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id  UUID        REFERENCES manga_sanctuary.api_keys(id) ON DELETE SET NULL,
  key_name    TEXT,
  method      TEXT        NOT NULL,
  path        TEXT        NOT NULL,
  status_code INT         NOT NULL,
  duration_ms INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_created_at ON manga_sanctuary.api_request_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_api_key_id ON manga_sanctuary.api_request_logs (api_key_id);

ALTER TABLE manga_sanctuary.api_request_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON manga_sanctuary.api_request_logs TO service_role;
