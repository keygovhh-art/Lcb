-- Internal personal hotline inbox. Website delivery creates no SMS/outbound call.
-- A telephony IVR connector must independently authenticate the member before playback.
CREATE TABLE IF NOT EXISTS public.hotline_mailbox_items(
 id bigserial PRIMARY KEY,
 broadcast_id integer NOT NULL REFERENCES public.broadcasts(id) ON DELETE RESTRICT,
 user_id integer NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 subject text NOT NULL,
 message text NOT NULL,
 audio_url text,
 read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(broadcast_id,user_id)
);
CREATE INDEX IF NOT EXISTS hotline_mailbox_owner_idx
 ON public.hotline_mailbox_items(user_id,created_at DESC);
ALTER TABLE public.hotline_mailbox_items ENABLE ROW LEVEL SECURITY;
-- Direct clients have no RLS policy; only the authenticated server API may read.
