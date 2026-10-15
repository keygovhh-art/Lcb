-- Preserve original work while recording exact completion time for new events.
-- Existing already-closed/finished rows stay NULL (unknown historic time).
ALTER TABLE askanus_cases ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE case_followups ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE askanus_tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
