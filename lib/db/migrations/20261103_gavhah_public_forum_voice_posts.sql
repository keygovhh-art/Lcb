-- Add-only linkage from public forum discussions to their caller-approved Yemot WAV.
-- Applying this file alone publishes no recordings and changes no existing posts.
CREATE TABLE IF NOT EXISTS public.gavhah_forum_voice_posts (
  discussion_id integer PRIMARY KEY REFERENCES public.discussions(id) ON DELETE CASCADE,
  member_id integer NOT NULL REFERENCES public.users(id),
  provider_recording_path text NOT NULL CHECK (provider_recording_path ~ '^ivr2:/[A-Za-z0-9_/-]+[.]wav$'),
  recording_fingerprint char(64) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gavhah_forum_voice_posts_recent_idx
  ON public.gavhah_forum_voice_posts (created_at DESC);
