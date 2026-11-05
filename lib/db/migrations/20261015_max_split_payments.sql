-- Incremental and backward-compatible: calls now support simultaneous partial
-- payment and remaining pledge; legacy amount/money_kind retain old semantics.
ALTER TABLE fundraising_call_reports
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pledged_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outcome_detail text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS mood_detail text NOT NULL DEFAULT '';
UPDATE fundraising_call_reports
 SET paid_amount = amount WHERE money_kind='received' AND paid_amount=0;
UPDATE fundraising_call_reports
 SET pledged_amount = amount WHERE money_kind='pledged' AND pledged_amount=0;
CREATE INDEX IF NOT EXISTS fundraising_call_reports_split_idx
 ON fundraising_call_reports(user_id,created_at DESC) WHERE money_kind='split';
