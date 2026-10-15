-- Only additive columns: old follow-ups and dates remain intact.
ALTER TABLE case_followups ADD COLUMN IF NOT EXISTS due_time text;
ALTER TABLE case_followups ADD COLUMN IF NOT EXISTS time_zone text;
