-- United in Kindness pledge/donate/case coordination. Additive, no changes to live provider.
-- Never infer a verified donation from a BL"N undertaking or a checkout intent.
CREATE TABLE IF NOT EXISTS public.gavhah_united_pledges (
 id BIGSERIAL PRIMARY KEY,
 cause_id INTEGER NOT NULL REFERENCES public.featured_causes(id),
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 case_id INTEGER NOT NULL REFERENCES public.askanus_cases(id),
 amount_cents BIGINT NOT NULL CHECK(amount_cents BETWEEN 1 AND 100000000000),
 due_on DATE NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('accepted_bln','pending_team','approved_bln','rejected','cancelled','fulfilled')),
 source TEXT NOT NULL CHECK(source IN ('web','yemot')),
 request_key TEXT NOT NULL,
 reviewer_id INTEGER REFERENCES public.users(id),
 review_note TEXT,
 reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(member_id,request_key)
);
CREATE INDEX IF NOT EXISTS gavhah_united_pledges_cause_status_idx
 ON public.gavhah_united_pledges(cause_id,status,due_on);
CREATE INDEX IF NOT EXISTS gavhah_united_pledges_case_idx
 ON public.gavhah_united_pledges(case_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.gavhah_united_donation_intents (
 id BIGSERIAL PRIMARY KEY,
 cause_id INTEGER NOT NULL REFERENCES public.featured_causes(id),
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 case_id INTEGER NOT NULL REFERENCES public.askanus_cases(id),
 amount_cents BIGINT CHECK(amount_cents BETWEEN 1 AND 100000000000),
 method TEXT NOT NULL DEFAULT 'instructions' CHECK(method IN ('instructions','hosted_checkout','offline_report')),
 state TEXT NOT NULL DEFAULT 'instructions_only' CHECK(state IN ('instructions_only','provider_pending','submitted_for_verification','verified','rejected','cancelled')),
 request_key TEXT NOT NULL,
 provider_reference TEXT,
 evidence_note TEXT,
 reviewed_by INTEGER REFERENCES public.users(id),
 reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(member_id,request_key)
);
CREATE INDEX IF NOT EXISTS gavhah_united_donation_intents_cause_idx
 ON public.gavhah_united_donation_intents(cause_id,state,created_at DESC);
CREATE TABLE IF NOT EXISTS public.gavhah_united_case_events (
 id BIGSERIAL PRIMARY KEY,
 cause_id INTEGER NOT NULL REFERENCES public.featured_causes(id),
 case_id INTEGER NOT NULL REFERENCES public.askanus_cases(id),
 author_id INTEGER NOT NULL REFERENCES public.users(id),
 kind TEXT NOT NULL CHECK(kind IN ('joined','pledge','pledge_review','donation_intent','donation_verified','note','followup','staff_notification','goal_notice','campaign_link','bonus_allocation','bonus_revoked')),
 details TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gavhah_united_case_events_case_idx
 ON public.gavhah_united_case_events(case_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.gavhah_united_case_access (
 case_id INTEGER NOT NULL REFERENCES public.askanus_cases(id) ON DELETE CASCADE,
 collaborator_id INTEGER NOT NULL REFERENCES public.users(id),
 role TEXT NOT NULL CHECK(role IN ('viewer','coordinator')),
 granted_by INTEGER NOT NULL REFERENCES public.users(id),
 expires_at TIMESTAMPTZ NOT NULL,
 revoked_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(case_id,collaborator_id)
);
CREATE INDEX IF NOT EXISTS gavhah_united_case_access_member_idx
 ON public.gavhah_united_case_access(collaborator_id,expires_at);
CREATE TABLE IF NOT EXISTS public.gavhah_united_campaign_center_links (
 cause_id INTEGER NOT NULL REFERENCES public.featured_causes(id),
 provider TEXT NOT NULL CHECK(provider IN ('campaign_center')),
 campaign_reference TEXT NOT NULL,
 plan_code TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','linked','disabled')),
 linked_by INTEGER NOT NULL REFERENCES public.users(id),
 linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(cause_id,provider)
);
-- Bonus allocations are ledger entitlements, not usable SignalWire provider credits.
-- Provider enforcement remains inactive until explicitly integrated and verified.
CREATE TABLE IF NOT EXISTS public.gavhah_united_olam_bonus_policies (
 cause_id INTEGER PRIMARY KEY REFERENCES public.featured_causes(id),
 enabled BOOLEAN NOT NULL DEFAULT false,
 minutes_per_member INTEGER NOT NULL DEFAULT 0 CHECK(minutes_per_member BETWEEN 0 AND 10000),
 expiration_days INTEGER NOT NULL DEFAULT 30 CHECK(expiration_days BETWEEN 1 AND 365),
 max_total_minutes INTEGER NOT NULL DEFAULT 0 CHECK(max_total_minutes BETWEEN 0 AND 1000000),
 provider_enforcement_active BOOLEAN NOT NULL DEFAULT false,
 configured_by INTEGER NOT NULL REFERENCES public.users(id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.gavhah_united_olam_bonus_allocations (
 id BIGSERIAL PRIMARY KEY,
 cause_id INTEGER NOT NULL REFERENCES public.featured_causes(id),
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 minutes_allocated INTEGER NOT NULL CHECK(minutes_allocated>0),
 minutes_used INTEGER NOT NULL DEFAULT 0 CHECK(minutes_used>=0),
 status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','active','expired','revoked')),
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 activated_by INTEGER REFERENCES public.users(id),
 activated_at TIMESTAMPTZ,
 UNIQUE(cause_id,member_id)
);
