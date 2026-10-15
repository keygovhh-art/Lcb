-- Staging-only performance indexes for growing MAX contact and follow-up workbooks.
-- Keeps historic My Askanus rows unchanged.
CREATE INDEX IF NOT EXISTS case_followups_case_status_due_idx
  ON case_followups(case_id, completed, due_date, id);
CREATE INDEX IF NOT EXISTS case_activity_log_case_created_idx
  ON case_activity_log(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS max_pledges_owner_status_due_idx
  ON max_pledges(user_id, status, due_date, id);
CREATE INDEX IF NOT EXISTS communication_contacts_owner_name_idx
  ON communication_contacts(user_id, lower(name));
CREATE INDEX IF NOT EXISTS communication_contacts_owner_phone_idx
  ON communication_contacts(user_id, phone);
