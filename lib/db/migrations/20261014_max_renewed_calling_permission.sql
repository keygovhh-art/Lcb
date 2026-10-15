-- Additive immutable consent events, no old contact records changed.
CREATE TABLE IF NOT EXISTS max_contact_consents (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  contact_id integer NOT NULL REFERENCES communication_contacts(id) ON DELETE RESTRICT,
  action text NOT NULL DEFAULT 'reconsent' CHECK(action IN ('reconsent','owner_override')),
  method text NOT NULL CHECK(method IN ('written','in_person','incoming_call','other','owner_decision')),
  evidence text NOT NULL CHECK(length(trim(evidence)) >= 12),
  prior_opt_out_reason text NOT NULL DEFAULT '',
  consent_at timestamp NOT NULL,
  request_id text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT max_contact_consents_owner_request_unique UNIQUE(user_id,request_id)
);
CREATE INDEX IF NOT EXISTS max_contact_consents_owner_contact_idx
  ON max_contact_consents(user_id,contact_id);
