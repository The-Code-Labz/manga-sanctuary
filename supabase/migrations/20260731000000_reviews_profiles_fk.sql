-- Reviews were joined to profiles in the frontend (`profiles ( username, avatar_url )`)
-- but reviews.user_id only had a FK to auth.users(id), not manga_sanctuary.profiles(id).
-- PostgREST can only auto-detect embeds across a direct FK, so every reviews query with
-- an embedded profiles select failed with PGRST200 ("Could not find a relationship
-- between 'reviews' and 'profiles'"), surfacing to the frontend as a 400.
--
-- profiles.id already 1:1-references auth.users(id) and is populated by the
-- on_auth_user_created trigger for every signed-up user, so every existing
-- reviews.user_id is guaranteed to already have a matching profiles row.
--
-- Ported from novel-sanctuary migration 20260731000000_reviews_profiles_fk.sql
-- (identical PGRST200 bug hit there 2026-07-31).
ALTER TABLE manga_sanctuary.reviews
  ADD CONSTRAINT reviews_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES manga_sanctuary.profiles(id) ON DELETE CASCADE;

-- Ask PostgREST to reload its schema cache so the new FK is picked up without
-- needing a full container restart.
NOTIFY pgrst, 'reload schema';
