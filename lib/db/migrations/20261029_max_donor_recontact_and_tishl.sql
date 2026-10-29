-- Dedicated, private per-donor eligibility window for recurring campaigns.
-- Future eligibility is NOT a permission to call; DNC and other consent
-- checks still apply at call time. No existing call/history rows are rewritten.
CREATE TABLE IF NOT EXISTS public.max_donor_recontact (
 id bigserial PRIMARY KEY,
 user_id integer NOT NULL,
 contact_id integer NOT NULL REFERENCES public.communication_contacts(id) ON DELETE CASCADE,
 case_id integer NOT NULL REFERENCES public.askanus_cases(id) ON DELETE CASCADE,
 scope text NOT NULL CHECK(scope IN ('same_purpose','new_purpose')),
 due_at timestamptz NOT NULL,
 source_report_id integer REFERENCES public.fundraising_call_reports(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','done','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,contact_id,case_id,scope)
);
CREATE INDEX IF NOT EXISTS max_donor_recontact_owner_due_idx
 ON public.max_donor_recontact(user_id,status,due_at);
CREATE INDEX IF NOT EXISTS max_donor_recontact_owner_contact_idx
 ON public.max_donor_recontact(user_id,contact_id);
