-- Approved Olam Hachesed MAX calling desk (staging).
-- Additive only; DO NOT run against live Neon before versioned backup and call-flow verification.
ALTER TABLE public.max_call_sessions
  ADD COLUMN IF NOT EXISTS reporting_source text NOT NULL DEFAULT 'provider',
  ADD COLUMN IF NOT EXISTS report_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS purpose_type text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS purpose_key text,
  ADD COLUMN IF NOT EXISTS manual_request_id uuid,
  ADD COLUMN IF NOT EXISTS history_hidden_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS max_call_manual_request_once
  ON public.max_call_sessions(user_id,manual_request_id) WHERE manual_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS max_call_owner_history_visible
  ON public.max_call_sessions(user_id,created_at DESC,id DESC)
  WHERE history_hidden_at IS NULL;
ALTER TABLE public.communication_contacts
  ADD COLUMN IF NOT EXISTS postal_address text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS olam_desk_due_25m
  ON public.gavhah_olam_desk_direct(user_id,due_at)
  WHERE kind='call_later' AND status='open';

-- A call's callback must create at most one canonical My Tishl reminder.
CREATE UNIQUE INDEX IF NOT EXISTS max_call_callback_once_per_member
 ON public.gavhah_olam_desk_direct(user_id,source_entity,source_id)
 WHERE source_entity='max_call_session' AND kind='call_later';
