-- =============================================================================
-- Manga Sanctuary — Standalone Schema Migration
-- Target schema : manga_sanctuary
-- Replaces      : all prior novel_sanctuary / public migrations for this app
-- Notes         : This migration creates a clean, separate schema for manga.
--                 It does NOT add tables to novel_sanctuary.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Schema & PostgREST exposure
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS manga_sanctuary;

GRANT USAGE ON SCHEMA manga_sanctuary TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Enum types
-- ---------------------------------------------------------------------------
CREATE TYPE manga_sanctuary.app_role AS ENUM ('admin', 'moderator', 'user');
CREATE TYPE manga_sanctuary.manga_type AS ENUM ('Manga', 'Manhwa', 'Manhua', 'Webtoon');

-- ---------------------------------------------------------------------------
-- 2. Tables (in FK dependency order)
-- ---------------------------------------------------------------------------

-- 2a. Profiles — one-to-one with auth.users
CREATE TABLE manga_sanctuary.profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT        UNIQUE,
  email       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2b. Authors
CREATE TABLE manga_sanctuary.authors (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  bio        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2c. Artists (manga often has separate author and artist)
CREATE TABLE manga_sanctuary.artists (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  bio        TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2d. Manga
CREATE TABLE manga_sanctuary.manga (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  alt_titles   TEXT[]      DEFAULT '{}',
  description  TEXT,
  author_id    UUID        REFERENCES manga_sanctuary.authors(id) ON DELETE SET NULL,
  artist_id    UUID        REFERENCES manga_sanctuary.artists(id) ON DELETE SET NULL,
  language     TEXT        NOT NULL DEFAULT 'EN'
                           CHECK (language IN ('JP', 'CN', 'KR', 'EN')),
  status       TEXT        NOT NULL DEFAULT 'ongoing'
                           CHECK (status IN ('ongoing', 'completed', 'hiatus', 'dropped')),
  cover_url    TEXT,
  manga_type   manga_sanctuary.manga_type NOT NULL DEFAULT 'Manga',
  is_approved  BOOLEAN     NOT NULL DEFAULT false,
  submitted_by UUID        REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2e. Genres
CREATE TABLE manga_sanctuary.genres (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);

-- 2f. Tags
CREATE TABLE manga_sanctuary.tags (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE
);

-- 2g. Manga-Genres junction
CREATE TABLE manga_sanctuary.manga_genres (
  manga_id UUID REFERENCES manga_sanctuary.manga(id) ON DELETE CASCADE,
  genre_id UUID REFERENCES manga_sanctuary.genres(id) ON DELETE CASCADE,
  PRIMARY KEY (manga_id, genre_id)
);

-- 2h. Manga-Tags junction
CREATE TABLE manga_sanctuary.manga_tags (
  manga_id UUID REFERENCES manga_sanctuary.manga(id) ON DELETE CASCADE,
  tag_id   UUID REFERENCES manga_sanctuary.tags(id)   ON DELETE CASCADE,
  PRIMARY KEY (manga_id, tag_id)
);

-- 2i. Chapters
CREATE TABLE manga_sanctuary.chapters (
  id             UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  manga_id       UUID              NOT NULL REFERENCES manga_sanctuary.manga(id) ON DELETE CASCADE,
  chapter_number DOUBLE PRECISION  NOT NULL,
  chapter_title  TEXT,
  external_url   TEXT,
  release_date   TIMESTAMPTZ       DEFAULT now(),
  volume_number  INTEGER,
  volume_title   TEXT,
  pages          JSONB             DEFAULT '[]'::jsonb
);

-- 2j. Chapter pages — normalized store for manga page images
CREATE TABLE manga_sanctuary.chapter_pages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id  UUID        NOT NULL REFERENCES manga_sanctuary.chapters(id) ON DELETE CASCADE,
  page_number INTEGER     NOT NULL,
  image_url   TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, page_number)
);

-- 2k. Reading progress
CREATE TABLE manga_sanctuary.reading_progress (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  manga_id          UUID        NOT NULL REFERENCES manga_sanctuary.manga(id) ON DELETE CASCADE,
  last_chapter_read DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_page_read    INTEGER     DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, manga_id)
);

-- 2l. Lists
CREATE TABLE manga_sanctuary.lists (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- 2m. List items
CREATE TABLE manga_sanctuary.list_items (
  id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id  UUID        NOT NULL REFERENCES manga_sanctuary.lists(id)  ON DELETE CASCADE,
  manga_id UUID        NOT NULL REFERENCES manga_sanctuary.manga(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (list_id, manga_id)
);

-- 2n. Reviews
CREATE TABLE manga_sanctuary.reviews (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id)          ON DELETE CASCADE,
  manga_id    UUID        NOT NULL REFERENCES manga_sanctuary.manga(id) ON DELETE CASCADE,
  rating      INTEGER     NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, manga_id)
);

-- 2o. Ratings
CREATE TABLE manga_sanctuary.ratings (
  id       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID    NOT NULL REFERENCES auth.users(id)             ON DELETE CASCADE,
  manga_id UUID    NOT NULL REFERENCES manga_sanctuary.manga(id) ON DELETE CASCADE,
  rating   INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  UNIQUE (user_id, manga_id)
);

-- 2p. User roles
CREATE TABLE manga_sanctuary.user_roles (
  id      UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID                      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role    manga_sanctuary.app_role  NOT NULL,
  UNIQUE (user_id, role)
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX ON manga_sanctuary.manga        (author_id);
CREATE INDEX ON manga_sanctuary.manga        (artist_id);
CREATE INDEX ON manga_sanctuary.manga        (manga_type);
CREATE INDEX ON manga_sanctuary.manga        (is_approved);
CREATE INDEX ON manga_sanctuary.chapters     (manga_id);
CREATE INDEX ON manga_sanctuary.chapter_pages (chapter_id, page_number);
CREATE INDEX ON manga_sanctuary.manga_genres  (genre_id);
CREATE INDEX ON manga_sanctuary.manga_tags    (tag_id);
CREATE INDEX ON manga_sanctuary.reading_progress (user_id);
CREATE INDEX ON manga_sanctuary.list_items   (list_id);
CREATE INDEX ON manga_sanctuary.reviews      (manga_id);
CREATE INDEX ON manga_sanctuary.ratings      (manga_id);
CREATE INDEX ON manga_sanctuary.user_roles   (user_id);

-- ---------------------------------------------------------------------------
-- 4. Helper function — role check
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION manga_sanctuary.has_role(_user_id uuid, _role manga_sanctuary.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = manga_sanctuary
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM manga_sanctuary.user_roles
    WHERE user_id = _user_id
      AND role    = _role
  )
$$;

-- ---------------------------------------------------------------------------
-- 5. Auth trigger functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION manga_sanctuary.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = manga_sanctuary
AS $$
BEGIN
  INSERT INTO manga_sanctuary.profiles (id, username, email, avatar_url)
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
  EXECUTE FUNCTION manga_sanctuary.handle_new_user();

CREATE OR REPLACE FUNCTION manga_sanctuary.handle_new_user_lists()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = manga_sanctuary
AS $$
BEGIN
  INSERT INTO manga_sanctuary.lists (user_id, name) VALUES
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
  EXECUTE FUNCTION manga_sanctuary.handle_new_user_lists();

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE manga_sanctuary.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.authors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.artists          ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.manga            ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.genres           ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.tags             ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.manga_genres     ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.manga_tags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.chapters         ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.chapter_pages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.lists            ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.list_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.reviews          ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.ratings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE manga_sanctuary.user_roles       ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Public profiles are viewable by everyone"
  ON manga_sanctuary.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile"
  ON manga_sanctuary.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON manga_sanctuary.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- authors
CREATE POLICY "Authors are viewable by everyone"
  ON manga_sanctuary.authors FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert authors"
  ON manga_sanctuary.authors FOR INSERT TO authenticated WITH CHECK (true);

-- artists
CREATE POLICY "Artists are viewable by everyone"
  ON manga_sanctuary.artists FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert artists"
  ON manga_sanctuary.artists FOR INSERT TO authenticated WITH CHECK (true);

-- manga
CREATE POLICY "Approved manga are viewable by everyone"
  ON manga_sanctuary.manga FOR SELECT USING (is_approved = true);
CREATE POLICY "Admins can view all manga"
  ON manga_sanctuary.manga FOR SELECT TO authenticated
  USING (manga_sanctuary.has_role(auth.uid(), 'admin'));
CREATE POLICY "Authenticated users can insert manga"
  ON manga_sanctuary.manga FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = submitted_by);
CREATE POLICY "Admins can update manga"
  ON manga_sanctuary.manga FOR UPDATE TO authenticated
  USING  (manga_sanctuary.has_role(auth.uid(), 'admin'))
  WITH CHECK (manga_sanctuary.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete manga"
  ON manga_sanctuary.manga FOR DELETE TO authenticated
  USING (manga_sanctuary.has_role(auth.uid(), 'admin'));

-- genres
CREATE POLICY "Genres are viewable by everyone"
  ON manga_sanctuary.genres FOR SELECT USING (true);
CREATE POLICY "Admins can insert genres"
  ON manga_sanctuary.genres FOR INSERT TO authenticated
  WITH CHECK (manga_sanctuary.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete genres"
  ON manga_sanctuary.genres FOR DELETE TO authenticated
  USING (manga_sanctuary.has_role(auth.uid(), 'admin'));

-- tags
CREATE POLICY "Tags are viewable by everyone"
  ON manga_sanctuary.tags FOR SELECT USING (true);
CREATE POLICY "Admins can insert tags"
  ON manga_sanctuary.tags FOR INSERT TO authenticated
  WITH CHECK (manga_sanctuary.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete tags"
  ON manga_sanctuary.tags FOR DELETE TO authenticated
  USING (manga_sanctuary.has_role(auth.uid(), 'admin'));

-- manga_genres
CREATE POLICY "Manga genres are viewable by everyone"
  ON manga_sanctuary.manga_genres FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert manga_genres"
  ON manga_sanctuary.manga_genres FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can delete manga_genres"
  ON manga_sanctuary.manga_genres FOR DELETE TO authenticated
  USING (manga_sanctuary.has_role(auth.uid(), 'admin'));

-- manga_tags
CREATE POLICY "Manga tags are viewable by everyone"
  ON manga_sanctuary.manga_tags FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert manga_tags"
  ON manga_sanctuary.manga_tags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can delete manga_tags"
  ON manga_sanctuary.manga_tags FOR DELETE TO authenticated
  USING (manga_sanctuary.has_role(auth.uid(), 'admin'));

-- chapters
CREATE POLICY "Chapters are viewable by everyone"
  ON manga_sanctuary.chapters FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert chapters"
  ON manga_sanctuary.chapters FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update chapters"
  ON manga_sanctuary.chapters FOR UPDATE TO authenticated
  USING  (manga_sanctuary.has_role(auth.uid(), 'admin'))
  WITH CHECK (manga_sanctuary.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete chapters"
  ON manga_sanctuary.chapters FOR DELETE TO authenticated
  USING (manga_sanctuary.has_role(auth.uid(), 'admin'));

-- chapter_pages
CREATE POLICY "Chapter pages are viewable by everyone"
  ON manga_sanctuary.chapter_pages FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert chapter pages"
  ON manga_sanctuary.chapter_pages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update chapter pages"
  ON manga_sanctuary.chapter_pages FOR UPDATE TO authenticated
  USING  (manga_sanctuary.has_role(auth.uid(), 'admin'))
  WITH CHECK (manga_sanctuary.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete chapter pages"
  ON manga_sanctuary.chapter_pages FOR DELETE TO authenticated
  USING (manga_sanctuary.has_role(auth.uid(), 'admin'));

-- reading_progress
CREATE POLICY "Users can view own reading progress"
  ON manga_sanctuary.reading_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reading progress"
  ON manga_sanctuary.reading_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reading progress"
  ON manga_sanctuary.reading_progress FOR UPDATE USING (auth.uid() = user_id);

-- lists
CREATE POLICY "Users can view own lists"
  ON manga_sanctuary.lists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own lists"
  ON manga_sanctuary.lists FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own lists"
  ON manga_sanctuary.lists FOR DELETE USING (auth.uid() = user_id);

-- list_items
CREATE POLICY "Users can view own list items"
  ON manga_sanctuary.list_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM manga_sanctuary.lists
      WHERE lists.id = list_items.list_id
        AND lists.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can insert own list items"
  ON manga_sanctuary.list_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM manga_sanctuary.lists
      WHERE lists.id = list_items.list_id
        AND lists.user_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete own list items"
  ON manga_sanctuary.list_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM manga_sanctuary.lists
      WHERE lists.id = list_items.list_id
        AND lists.user_id = auth.uid()
    )
  );

-- reviews
CREATE POLICY "Reviews are viewable by everyone"
  ON manga_sanctuary.reviews FOR SELECT USING (true);
CREATE POLICY "Users can insert own reviews"
  ON manga_sanctuary.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reviews"
  ON manga_sanctuary.reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reviews"
  ON manga_sanctuary.reviews FOR DELETE USING (auth.uid() = user_id);

-- ratings
CREATE POLICY "Ratings are viewable by everyone"
  ON manga_sanctuary.ratings FOR SELECT USING (true);
CREATE POLICY "Users can insert own ratings"
  ON manga_sanctuary.ratings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ratings"
  ON manga_sanctuary.ratings FOR UPDATE USING (auth.uid() = user_id);

-- user_roles
CREATE POLICY "Admins can manage roles"
  ON manga_sanctuary.user_roles FOR ALL TO authenticated
  USING (manga_sanctuary.has_role(auth.uid(), 'admin'))
  WITH CHECK (manga_sanctuary.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view own roles"
  ON manga_sanctuary.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 7. PostgREST table-level grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON
  manga_sanctuary.profiles,
  manga_sanctuary.authors,
  manga_sanctuary.artists,
  manga_sanctuary.manga,
  manga_sanctuary.genres,
  manga_sanctuary.tags,
  manga_sanctuary.manga_genres,
  manga_sanctuary.manga_tags,
  manga_sanctuary.chapters,
  manga_sanctuary.chapter_pages,
  manga_sanctuary.reviews,
  manga_sanctuary.ratings
TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  manga_sanctuary.profiles,
  manga_sanctuary.authors,
  manga_sanctuary.artists,
  manga_sanctuary.manga,
  manga_sanctuary.genres,
  manga_sanctuary.tags,
  manga_sanctuary.manga_genres,
  manga_sanctuary.manga_tags,
  manga_sanctuary.chapters,
  manga_sanctuary.chapter_pages,
  manga_sanctuary.reading_progress,
  manga_sanctuary.lists,
  manga_sanctuary.list_items,
  manga_sanctuary.reviews,
  manga_sanctuary.ratings,
  manga_sanctuary.user_roles
TO authenticated;

GRANT ALL ON ALL TABLES    IN SCHEMA manga_sanctuary TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA manga_sanctuary TO service_role;
GRANT ALL ON ALL ROUTINES  IN SCHEMA manga_sanctuary TO service_role;

GRANT EXECUTE ON FUNCTION manga_sanctuary.has_role(uuid, manga_sanctuary.app_role)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Seed — first admin user (uncomment and replace UUID after first login)
-- ---------------------------------------------------------------------------
-- INSERT INTO manga_sanctuary.user_roles (user_id, role)
-- VALUES ('<YOUR-ADMIN-USER-UUID>', 'admin');

-- ---------------------------------------------------------------------------
-- End of migration
-- ---------------------------------------------------------------------------
