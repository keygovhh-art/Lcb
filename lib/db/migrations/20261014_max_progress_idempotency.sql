-- Make legacy My Askanus money entries idempotent and auditable.
CREATE TABLE IF NOT EXISTS max_progress_events(
 id serial PRIMARY KEY,
 user_id integer NOT NULL,
 case_id integer NOT NULL REFERENCES askanus_cases(id) ON DELETE RESTRICT,
 event_kind text NOT NULL CHECK(event_kind IN ('funds_received','funds_promised')),
 amount numeric(12,2) NOT NULL CHECK(amount > 0),
 request_id text NOT NULL,
 created_at timestamp NOT NULL DEFAULT now(),
 CONSTRAINT max_progress_events_owner_request_unique UNIQUE(user_id,request_id)
);
CREATE INDEX IF NOT EXISTS max_progress_events_case_idx ON max_progress_events(case_id);
