-- Stage 2: donor 360, contact preferences, single pledge/partial receipt records.
-- Backward compatible: no existing content is deleted or replaced.
ALTER TABLE fundraising_call_reports ADD COLUMN IF NOT EXISTS observed_mood text NOT NULL DEFAULT 'neutral';
ALTER TABLE communication_contacts ADD COLUMN IF NOT EXISTS do_not_call boolean NOT NULL DEFAULT false;
ALTER TABLE communication_contacts ADD COLUMN IF NOT EXISTS preferred_timezone text NOT NULL DEFAULT 'America/New_York';
ALTER TABLE communication_contacts ADD COLUMN IF NOT EXISTS preferred_hours text NOT NULL DEFAULT '';
ALTER TABLE communication_contacts ADD COLUMN IF NOT EXISTS contact_role text NOT NULL DEFAULT 'donor';
ALTER TABLE communication_contacts ADD COLUMN IF NOT EXISTS relationship_notes text NOT NULL DEFAULT '';
ALTER TABLE communication_contacts ADD COLUMN IF NOT EXISTS opt_out_reason text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS max_pledges (
 id serial PRIMARY KEY,
 user_id integer NOT NULL,
 case_id integer NOT NULL REFERENCES askanus_cases(id) ON DELETE RESTRICT,
 contact_id integer REFERENCES communication_contacts(id) ON DELETE SET NULL,
 call_report_id integer REFERENCES fundraising_call_reports(id) ON DELETE SET NULL,
 amount numeric(12,2) NOT NULL CHECK (amount > 0),
 paid_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK(paid_amount >= 0 AND paid_amount <= amount),
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','cancelled')),
 due_date text,
 note text NOT NULL DEFAULT '',
 created_at timestamp NOT NULL DEFAULT now(),
 updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS max_pledges_owner_case_idx ON max_pledges(user_id,case_id);
CREATE INDEX IF NOT EXISTS max_pledges_contact_idx ON max_pledges(contact_id);
CREATE TABLE IF NOT EXISTS max_receipts (
 id serial PRIMARY KEY,
 user_id integer NOT NULL,
 case_id integer NOT NULL REFERENCES askanus_cases(id) ON DELETE RESTRICT,
 contact_id integer REFERENCES communication_contacts(id) ON DELETE SET NULL,
 pledge_id integer REFERENCES max_pledges(id) ON DELETE RESTRICT,
 call_report_id integer REFERENCES fundraising_call_reports(id) ON DELETE SET NULL,
 amount numeric(12,2) NOT NULL CHECK(amount > 0),
 method text NOT NULL DEFAULT 'other',
 reference text NOT NULL DEFAULT '',
 verification text NOT NULL DEFAULT 'manually_reported' CHECK(verification IN ('manually_reported','verified','reversed')),
 request_id text NOT NULL,
 created_at timestamp NOT NULL DEFAULT now(),
 CONSTRAINT max_receipts_owner_request_unique UNIQUE(user_id,request_id)
);
CREATE INDEX IF NOT EXISTS max_receipts_owner_case_idx ON max_receipts(user_id,case_id);
CREATE INDEX IF NOT EXISTS max_receipts_pledge_idx ON max_receipts(pledge_id);
CREATE TABLE IF NOT EXISTS max_followup_contacts (
 followup_id integer PRIMARY KEY REFERENCES case_followups(id) ON DELETE CASCADE,
 user_id integer NOT NULL,
 contact_id integer NOT NULL REFERENCES communication_contacts(id) ON DELETE CASCADE,
 created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS max_followup_contacts_contact_idx ON max_followup_contacts(user_id,contact_id);
