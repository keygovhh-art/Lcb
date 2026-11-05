-- Phone and public website Askanim voice discussions; additive only.
-- Existing discussions, comments, phone routes, and provider files stay untouched.
CREATE TABLE IF NOT EXISTS public.gavhah_discussion_voice_posts (
  id BIGSERIAL PRIMARY KEY,
  discussion_id INTEGER NOT NULL UNIQUE REFERENCES public.discussions(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES public.users(id),
  provider_recording_path TEXT,
  audio_data BYTEA,
  mime_type TEXT NOT NULL DEFAULT 'audio/wav',
  fingerprint CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gavhah_discussion_voice_source_ck CHECK
    ((provider_recording_path IS NOT NULL AND audio_data IS NULL)
      OR (provider_recording_path IS NULL AND audio_data IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS gavhah_discussion_voice_posts_member_time_idx
  ON public.gavhah_discussion_voice_posts(member_id,created_at DESC);
