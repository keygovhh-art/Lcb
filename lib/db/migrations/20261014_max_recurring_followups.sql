-- Backward-compatible shared case follow-up recurrence, no production rollout yet.
ALTER TABLE case_followups ADD COLUMN IF NOT EXISTS repeat_rule text NOT NULL DEFAULT 'none';
ALTER TABLE case_followups ADD COLUMN IF NOT EXISTS repeat_anchor_day integer;
ALTER TABLE case_followups ADD COLUMN IF NOT EXISTS generated_from_id integer;
CREATE UNIQUE INDEX IF NOT EXISTS case_followups_generated_from_unique ON case_followups(generated_from_id);
