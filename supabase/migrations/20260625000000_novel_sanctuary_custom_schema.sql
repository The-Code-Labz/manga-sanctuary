-- =============================================================================
-- Novel Sanctuary — Consolidated Schema Migration
-- Target schema : novel_sanctuary
-- Replaces      : all prior public.* migrations (squashed)
-- Self-hosted Supabase notes:
--   1. Add "novel_sanctuary" to the `db_schema` list in supabase/config.toml
--      (or via Studio → Database → API → Exposed schemas)
--   2. Frontend client must pass  { db: { schema: 'novel_sanctuary' } }
--      to createClient() — see src/integrations/supabase/client.ts
--   3. Run as the postgres superuser (migration runner)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Schema & PostgREST exposure
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS novel_sanctuary;

-- PostgREST requires USAGE + object-level grants on the exposed schema.
GRANT USAGE ON SCHEMA novel_sanctuary TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Enum type
-- ---------------------------------------------------------------------------
CREATE TYPE novel_sanctuary.app_role AS ENUM ('admin', 'moderator', 'user');

-- ---------------------------------------------------------------------------
-- 2. Tables  (in FK dependency order)
-- ---------------------------------------------------------------------------

-- 2a. Profiles — one-to-one with auth.users
CREATE TABLE novel_sanctuary.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT        UNIQUE,
  email       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2b. Authors
CREATE TABLE novel_sanctuary.authors (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  bio        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2c. Novels
CREATE TABLE novel_sanctuary.novels (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  alt_titles   TEXT[]      DEFAULT '{}',
  description  TEXT,
  author_id    UUID        REFERENCES novel_sanctuary.authors(id),
  language     TEXT        NOT NULL DEFAULT 'EN'
                           CHECK (language IN ('JP', 'CN', 'KR', 'EN')),
  status       TEXT        NOT NULL DEFAULT 'ongoing'
                           CHECK (status IN ('ongoing', 'completed', 'hiatus', 'dropped')),
  cover_url    TEXT,
  novel_type   TEXT        CHECK (novel_type IN ('Light Novel', 'Web Novel')),
  is_approved  BOOLEAN     NOT NULL DEFAULT false,
  submitted_by UUID        REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2d. Genres
CREATE TABLE novel_sanctuary.genres (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);

-- 2e. Tags
CREATE TABLE novel_sanctuary.tags (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);

-- 2f. Novel-Genres junction
CREATE TABLE novel_sanctuary.novel_genres (
  novel_id UUID REFERENCES novel_sanctuary.novels(id) ON DELETE CASCADE,
  genre_id UUID REFERENCES novel_sanctuary.genres(id) ON DELETE CASCADE,
  PRIMARY KEY (novel_id, genre_id)
);

-- 2g. Novel-Tags junction
CREATE TABLE novel_sanctuary.novel_tags (
  novel_id UUID REFERENCES novel_sanctuary.novels(id) ON DELETE CASCADE,
  tag_id   UUID REFERENCES novel_sanctuary.tags(id)   ON DELETE CASCADE,
  PRIMARY KEY (novel_id, tag_id)
);

-- 2h. Chapters
CREATE TABLE novel_sanctuary.chapters (
  id             UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  novel_id       UUID              NOT NULL REFERENCES novel_sanctuary.novels(id) ON DELETE CASCADE,
  chapter_number DOUBLE PRECISION  NOT NULL,
  chapter_title  TEXT,
  external_url   TEXT,
  release_date   TIMESTAMPTZ       DEFAULT now(),
  volume_number  INTEGER,
  volume_title   TEXT
);

-- 2i. Reading progress
CREATE TABLE novel_sanctuary.reading_progress (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  novel_id          UUID        NOT NULL REFERENCES novel_sanctuary.novels(id) ON DELETE CASCADE,
  last_chapter_read DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, novel_id)
);

-- 2j. Lists
CREATE TABLE novel_sanctuary.lists (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- 2k. List items
CREATE TABLE novel_sanctuary.list_items (
  id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id  UUID        NOT NULL REFERENCES novel_sanctuary.lists(id)  ON DELETE CASCADE,
  novel_id UUID        NOT NULL REFERENCES novel_sanctuary.novels(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (list_id, novel_id)
);

-- 2l. Reviews
CREATE TABLE novel_sanctuary.reviews (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id)          ON DELETE CASCADE,
  novel_id    UUID        NOT NULL REFERENCES novel_sanctuary.novels(id) ON DELETE CASCADE,
  rating      INTEGER     NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, novel_id)
);

-- 2m. Ratings (separate lightweight table from reviews)
CREATE TABLE novel_sanctuary.ratings (
  id       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID    NOT NULL REFERENCES auth.users(id)             ON DELETE CASCADE,
  novel_id UUID    NOT NULL REFERENCES novel_sanctuary.novels(id) ON DELETE CASCADE,
  rating   INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  UNIQUE (user_id, novel_id)
);

-- 2n. User roles
CREATE TABLE novel_sanctuary.user_roles (
  id      UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID                      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role    novel_sanctuary.app_role  NOT NULL,
  UNIQUE (user_id, role)
);

-- ---------------------------------------------------------------------------
-- 3. Indexes (performance)
-- ---------------------------------------------------------------------------
CREATE INDEX ON novel_sanctuary.novels        (author_id);
CREATE INDEX ON novel_sanctuary.novels        (is_approved);
CREATE INDEX ON novel_sanctuary.chapters      (novel_id);
CREATE INDEX ON novel_sanctuary.novel_genres  (genre_id);
CREATE INDEX ON novel_sanctuary.novel_tags    (tag_id);
CREATE INDEX ON novel_sanctuary.reading_progress (user_id);
CREATE INDEX ON novel_sanctuary.list_items    (list_id);
CREATE INDEX ON novel_sanctuary.reviews       (novel_id);
CREATE INDEX ON novel_sanctuary.ratings       (novel_id);
CREATE INDEX ON novel_sanctuary.user_roles    (user_id);

-- ---------------------------------------------------------------------------
-- 4. Helper function — role check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION novel_sanctuary.has_role(_user_id uuid, _role novel_sanctuary.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = novel_sanctuary
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM novel_sanctuary.user_roles
    WHERE user_id = _user_id
      AND role    = _role
  )
$$;

-- ---------------------------------------------------------------------------
-- 5. Auth trigger functions
-- ---------------------------------------------------------------------------

-- 5a. Auto-create profile row on signup
CREATE OR REPLACE FUNCTION novel_sanctuary.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = novel_sanctuary
AS $$
BEGIN
  INSERT INTO novel_sanctuary.profiles (id, username, email, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION novel_sanctuary.handle_new_user();

-- 5b. Auto-create default reading lists on signup
CREATE OR REPLACE FUNCTION novel_sanctuary.handle_new_user_lists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = novel_sanctuary
AS $$
BEGIN
  INSERT INTO novel_sanctuary.lists (user_id, name) VALUES
    (NEW.id, 'Reading'),
    (NEW.id, 'Completed'),
    (NEW.id, 'Plan to Read'),
    (NEW.id, 'Dropped'),
    (NEW.id, 'Favorites');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_lists
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION novel_sanctuary.handle_new_user_lists();

-- ---------------------------------------------------------------------------
-- 6. Row Level Security — enable on every table
-- ---------------------------------------------------------------------------
ALTER TABLE novel_sanctuary.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE novel_sanctuary.authors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE novel_sanctuary.novels           ENABLE ROW LEVEL SECURITY;
ALTER TABLE novel_sanctuary.genres           ENABLE ROW LEVEL SECURITY;
ALTER TABLE novel_sanctuary.tags             ENABLE ROW LEVEL SECURITY;
ALTER TABLE novel_sanctuary.novel_genres     ENABLE ROW LEVEL SECURITY;
ALTER TABLE novel_sanctuary.novel_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE novel_sanctuary.chapters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE novel_sanctuary.reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE novel_sanctuary.lists            ENABLE ROW LEVEL SECURITY;
ALTER TABLE novel_sanctuary.list_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE novel_sanctuary.reviews          ENABLE ROW LEVEL SECURITY;
ALTER TABLE novel_sanctuary.ratings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE novel_sanctuary.user_roles       ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 7. RLS Policies
-- ---------------------------------------------------------------------------

-- profiles
CREATE POLICY "Public profiles are viewable by everyone"
  ON novel_sanctuary.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile"
  ON novel_sanctuary.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON novel_sanctuary.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- authors
CREATE POLICY "Authors are viewable by everyone"
  ON novel_sanctuary.authors FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert authors"
  ON novel_sanctuary.authors FOR INSERT TO authenticated WITH CHECK (true);

-- novels
CREATE POLICY "Approved novels are viewable by everyone"
  ON novel_sanctuary.novels FOR SELECT USING (is_approved = true);
CREATE POLICY "Admins can view all novels"
  ON novel_sanctuary.novels FOR SELECT TO authenticated
  USING (novel_sanctuary.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated users can insert novels"
  ON novel_sanctuary.novels FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = submitted_by);
CREATE POLICY "Admins can update novels"
  ON novel_sanctuary.novels FOR UPDATE TO authenticated
  USING  (novel_sanctuary.has_role(auth.uid(), 'admin'))
  WITH CHECK (novel_sanctuary.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete novels"
  ON novel_sanctuary.novels FOR DELETE TO authenticated
  USING (novel_sanctuary.has_role(auth.uid(), 'admin'));

-- genres
CREATE POLICY "Genres are viewable by everyone"
  ON novel_sanctuary.genres FOR SELECT USING (true);
CREATE POLICY "Admins can insert genres"
  ON novel_sanctuary.genres FOR INSERT TO authenticated
  WITH CHECK (novel_sanctuary.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete genres"
  ON novel_sanctuary.genres FOR DELETE TO authenticated
  USING (novel_sanctuary.has_role(auth.uid(), 'admin'));

-- tags
CREATE POLICY "Tags are viewable by everyone"
  ON novel_sanctuary.tags FOR SELECT USING (true);
CREATE POLICY "Admins can insert tags"
  ON novel_sanctuary.tags FOR INSERT TO authenticated
  WITH CHECK (novel_sanctuary.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete tags"
  ON novel_sanctuary.tags FOR DELETE TO authenticated
  USING (novel_sanctuary.has_role(auth.uid(), 'admin'));

-- novel_genres
CREATE POLICY "Novel genres are viewable by everyone"
  ON novel_sanctuary.novel_genres FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert novel_genres"
  ON novel_sanctuary.novel_genres FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can delete novel_genres"
  ON novel_sanctuary.novel_genres FOR DELETE TO authenticated
  USING (novel_sanctuary.has_role(auth.uid(), 'admin'));

-- novel_tags
CREATE POLICY "Novel tags are viewable by everyone"
  ON novel_sanctuary.novel_tags FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert novel_tags"
  ON novel_sanctuary.novel_tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can delete novel_tags"
  ON novel_sanctuary.novel_tags FOR DELETE TO authenticated
  USING (novel_sanctuary.has_role(auth.uid(), 'admin'));

-- chapters
CREATE POLICY "Chapters are viewable by everyone"
  ON novel_sanctuary.chapters FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert chapters"
  ON novel_sanctuary.chapters FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update chapters"
  ON novel_sanctuary.chapters FOR UPDATE TO authenticated
  USING  (novel_sanctuary.has_role(auth.uid(), 'admin'))
  WITH CHECK (novel_sanctuary.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete chapters"
  ON novel_sanctuary.chapters FOR DELETE TO authenticated
  USING (novel_sanctuary.has_role(auth.uid(), 'admin'));

-- reading_progress
CREATE POLICY "Users can view own reading progress"
  ON novel_sanctuary.reading_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reading progress"
  ON novel_sanctuary.reading_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reading progress"
  ON novel_sanctuary.reading_progress FOR UPDATE USING (auth.uid() = user_id);

-- lists
CREATE POLICY "Users can view own lists"
  ON novel_sanctuary.lists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own lists"
  ON novel_sanctuary.lists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own lists"
  ON novel_sanctuary.lists FOR DELETE USING (auth.uid() = user_id);

-- list_items
CREATE POLICY "Users can view own list items"
  ON novel_sanctuary.list_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM novel_sanctuary.lists
      WHERE lists.id = list_items.list_id
        AND lists.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert own list items"
  ON novel_sanctuary.list_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM novel_sanctuary.lists
      WHERE lists.id = list_items.list_id
        AND lists.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete own list items"
  ON novel_sanctuary.list_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM novel_sanctuary.lists
      WHERE lists.id = list_items.list_id
        AND lists.user_id = auth.uid()
    )
  );

-- reviews
CREATE POLICY "Reviews are viewable by everyone"
  ON novel_sanctuary.reviews FOR SELECT USING (true);
CREATE POLICY "Users can insert own reviews"
  ON novel_sanctuary.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reviews"
  ON novel_sanctuary.reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reviews"
  ON novel_sanctuary.reviews FOR DELETE USING (auth.uid() = user_id);

-- ratings
CREATE POLICY "Ratings are viewable by everyone"
  ON novel_sanctuary.ratings FOR SELECT USING (true);
CREATE POLICY "Users can insert own ratings"
  ON novel_sanctuary.ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ratings"
  ON novel_sanctuary.ratings FOR UPDATE USING (auth.uid() = user_id);

-- user_roles
CREATE POLICY "Admins can manage roles"
  ON novel_sanctuary.user_roles FOR ALL TO authenticated
  USING (novel_sanctuary.has_role(auth.uid(), 'admin'))
  WITH CHECK (novel_sanctuary.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own roles"
  ON novel_sanctuary.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 8. PostgREST table-level grants
--    anon  — read-only on public-facing tables
--    authenticated — full CRUD where RLS permits
-- ---------------------------------------------------------------------------
GRANT SELECT ON
  novel_sanctuary.profiles,
  novel_sanctuary.authors,
  novel_sanctuary.novels,
  novel_sanctuary.genres,
  novel_sanctuary.tags,
  novel_sanctuary.novel_genres,
  novel_sanctuary.novel_tags,
  novel_sanctuary.chapters,
  novel_sanctuary.reviews,
  novel_sanctuary.ratings
TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  novel_sanctuary.profiles,
  novel_sanctuary.authors,
  novel_sanctuary.novels,
  novel_sanctuary.genres,
  novel_sanctuary.tags,
  novel_sanctuary.novel_genres,
  novel_sanctuary.novel_tags,
  novel_sanctuary.chapters,
  novel_sanctuary.reading_progress,
  novel_sanctuary.lists,
  novel_sanctuary.list_items,
  novel_sanctuary.reviews,
  novel_sanctuary.ratings,
  novel_sanctuary.user_roles
TO authenticated;

-- service_role bypasses RLS and needs full access
GRANT ALL ON ALL TABLES    IN SCHEMA novel_sanctuary TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA novel_sanctuary TO service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA novel_sanctuary TO service_role;

-- Allow roles to execute the helper function
GRANT EXECUTE ON FUNCTION novel_sanctuary.has_role(uuid, novel_sanctuary.app_role)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Seed — first admin user
--    Replace the UUID below with the auth.users id of the site owner.
--    You can find it in Studio → Authentication → Users after first login.
-- ---------------------------------------------------------------------------
-- INSERT INTO novel_sanctuary.user_roles (user_id, role)
-- VALUES ('<YOUR-ADMIN-USER-UUID>', 'admin');

-- ---------------------------------------------------------------------------
-- End of migration
-- ---------------------------------------------------------------------------
