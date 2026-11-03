-- Add-only staging migration, separate from personal My Askanus case IDs.
-- Data never syncs automatically outside explicitly authorized campaign contacts.
ALTER TABLE public.max_call_sessions
 ADD COLUMN IF NOT EXISTS cc_campaign_id uuid,
 ADD COLUMN IF NOT EXISTS cc_contact_id uuid,
 ADD COLUMN IF NOT EXISTS cc_claimed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS max_call_sessions_cc_pending_unique
 ON public.max_call_sessions(user_id,cc_contact_id)
 WHERE cc_contact_id IS NOT NULL AND status='prepared';
CREATE INDEX IF NOT EXISTS max_call_sessions_cc_campaign_idx
 ON public.max_call_sessions(user_id,cc_campaign_id,created_at DESC);
