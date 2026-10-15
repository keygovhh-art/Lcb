-- Gavhah MAX / My Askanus unified manual fundraising desk.
-- Forward-only migration. Apply on an isolated Neon branch before any production rollout.
-- Never store sensitive payment-card details or unverified provider-call claims.
CREATE TABLE IF NOT EXISTS communication_contacts (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS communication_contacts_user_idx ON communication_contacts(user_id);
CREATE TABLE IF NOT EXISTS fundraising_call_reports (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  case_id integer NOT NULL REFERENCES askanus_cases(id) ON DELETE RESTRICT,
  contact_id integer REFERENCES communication_contacts(id) ON DELETE SET NULL,
  contact_name text NOT NULL,
  outcome text NOT NULL,
  money_kind text NOT NULL DEFAULT 'none' CHECK (money_kind IN ('none','received','pledged')),
  amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  note text NOT NULL DEFAULT '',
  request_id text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT fundraising_call_reports_owner_request_unique UNIQUE (user_id,request_id)
);
CREATE INDEX IF NOT EXISTS fundraising_call_reports_owner_created_idx ON fundraising_call_reports(user_id,created_at);
CREATE INDEX IF NOT EXISTS fundraising_call_reports_case_idx ON fundraising_call_reports(case_id);