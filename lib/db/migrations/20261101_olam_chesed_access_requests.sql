-- Olam Chesed Communication is SignalWire-only; no caller-ID based privilege.
-- A Gavhah account is not automatically a linked Olam Chesed account.
CREATE TABLE IF NOT EXISTS public.gavhah_olam_chesed_access (
  user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested','reviewing','linked','denied')),
  reason text NOT NULL DEFAULT '',
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by integer REFERENCES public.users(id),
  review_note text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS gavhah_olam_access_review_idx
 ON public.gavhah_olam_chesed_access (status, requested_at DESC);
