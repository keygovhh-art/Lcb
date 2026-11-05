-- Gavhah Group Center: additive phone/website parity.
-- Apply on the existing Govhh Neon project only, after a reviewed deployment.
-- Saving a group is independent from becoming a member. Member lists are queried
-- alongside explicit bookmarks; joining does not silently opt into notifications.
CREATE TABLE IF NOT EXISTS public.group_phone_profiles (
  group_id integer PRIMARY KEY REFERENCES public.groups(id) ON DELETE CASCADE,
  intro_wav bytea,
  intro_text text,
  intro_language text CHECK (intro_language IS NULL OR intro_language IN ('yi','en')),
  member_stats_public boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (intro_wav IS NULL OR octet_length(intro_wav) <= 1000000),
  CHECK (intro_text IS NULL OR char_length(intro_text) <= 1000)
);
-- The existing public.saved_items user/content unique index is reused.
CREATE INDEX IF NOT EXISTS group_members_user_status_group_idx
 ON public.group_members (user_id,status,group_id);
CREATE INDEX IF NOT EXISTS group_posts_group_published_idx
 ON public.group_posts (group_id,moderation_status,created_at DESC);
