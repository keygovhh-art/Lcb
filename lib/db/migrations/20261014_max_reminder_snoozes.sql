-- Snoozing an on-screen MAX reminder never alters original shared follow-up obligations.
CREATE TABLE IF NOT EXISTS max_reminder_snoozes (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  followup_id integer NOT NULL REFERENCES case_followups(id) ON DELETE CASCADE,
  snoozed_until timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT max_reminder_snoozes_owner_followup_unique UNIQUE (user_id,followup_id)
);
CREATE INDEX IF NOT EXISTS max_reminder_snoozes_owner_until_idx
  ON max_reminder_snoozes(user_id,snoozed_until);
