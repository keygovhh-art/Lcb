-- Additive dual-amount call accounting. Legacy 'amount' is retained for older clients.
ALTER TABLE public.fundraising_call_reports
 ADD COLUMN IF NOT EXISTS pledged_amount numeric(12,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS received_amount numeric(12,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS other_details text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS fundraising_call_reports_dual_amount_idx
 ON public.fundraising_call_reports(user_id,created_at DESC);
