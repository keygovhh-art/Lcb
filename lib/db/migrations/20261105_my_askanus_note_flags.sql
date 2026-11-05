-- My Askanus notes: cross-out and completion are independent of permanent deletion.
-- The existing website and telephone share these persisted state flags.
ALTER TABLE public.askanus_notes
  ADD COLUMN IF NOT EXISTS crossed_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS askanus_notes_user_created_idx
  ON public.askanus_notes (user_id, created_at DESC, id DESC);
