-- Gavhah / Yemot private media studio. Additive only; never modifies existing IVR.
CREATE TABLE IF NOT EXISTS public.gavhah_yemot_voice_prompts (
  path text PRIMARY KEY CHECK (path = 'root' OR path ~ '^[1-9][0-9]{0,15}$'),
  tts_text text NOT NULL DEFAULT '',
  audio_data bytea,
  mime_type text,
  published_path text,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.gavhah_yemot_voice_prompts FROM PUBLIC;
