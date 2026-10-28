-- Dedicated add-only media folder for Gavhah Yemot prompts.
-- Never change / (root), /0 (existing management), /1 or /2.
CREATE TABLE IF NOT EXISTS public.gavhah_yemot_voice_storage (
 id integer PRIMARY KEY DEFAULT 1 CHECK(id=1),
 media_folder text NOT NULL CHECK(media_folder ~ '^/[0-9]{2,3}$'),
 prepared_at timestamptz NOT NULL DEFAULT now()
);
