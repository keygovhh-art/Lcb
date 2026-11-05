-- Today's Cause is its own campaign/finance channel; never merges with United.
CREATE TABLE IF NOT EXISTS public.gavhah_daily_joined (
 charity_id INTEGER NOT NULL REFERENCES public.charities(id),
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 case_id INTEGER NOT NULL REFERENCES public.askanus_cases(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(charity_id,member_id),
 UNIQUE(case_id)
);
CREATE TABLE IF NOT EXISTS public.gavhah_daily_pledges (
 id BIGSERIAL PRIMARY KEY,
 charity_id INTEGER NOT NULL REFERENCES public.charities(id),
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 case_id INTEGER NOT NULL REFERENCES public.askanus_cases(id),
 amount_cents BIGINT NOT NULL CHECK(amount_cents>0 AND amount_cents<=100000000000),
 due_on DATE NOT NULL,
 status TEXT NOT NULL CHECK(status IN('accepted_bln','pending_team','approved_bln','rejected','cancelled','fulfilled')),
 source TEXT NOT NULL CHECK(source IN('web','yemot')),
 request_key TEXT NOT NULL,
 reviewed_by INTEGER REFERENCES public.users(id),
 reviewed_at TIMESTAMPTZ,
 review_note TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(member_id,request_key)
);
CREATE INDEX IF NOT EXISTS gavhah_daily_pledges_status ON public.gavhah_daily_pledges(charity_id,status,due_on);
CREATE TABLE IF NOT EXISTS public.gavhah_daily_donation_intents (
 id BIGSERIAL PRIMARY KEY,
 charity_id INTEGER NOT NULL REFERENCES public.charities(id),
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 case_id INTEGER NOT NULL REFERENCES public.askanus_cases(id),
 amount_cents BIGINT CHECK(amount_cents>0 AND amount_cents<=100000000000),
 method TEXT NOT NULL DEFAULT 'instructions' CHECK(method IN('instructions','hosted_checkout','offline_report')),
 state TEXT NOT NULL DEFAULT 'instructions_only'
  CHECK(state IN('instructions_only','provider_pending','submitted_for_verification','verified','rejected','cancelled')),
 request_key TEXT NOT NULL,
 evidence_note TEXT,
 reviewed_by INTEGER REFERENCES public.users(id),
 reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(member_id,request_key)
);
CREATE INDEX IF NOT EXISTS gavhah_daily_donation_intents_state
 ON public.gavhah_daily_donation_intents(charity_id,state,created_at DESC);
CREATE TABLE IF NOT EXISTS public.gavhah_daily_verified_totals (
 charity_id INTEGER PRIMARY KEY REFERENCES public.charities(id),
 verified_cents BIGINT NOT NULL DEFAULT 0 CHECK(verified_cents>=0),
 verification_note TEXT NOT NULL DEFAULT '',
 recorded_by INTEGER NOT NULL REFERENCES public.users(id),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.gavhah_daily_phone_nominations (
 id BIGSERIAL PRIMARY KEY,
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 cause_title_audio TEXT NOT NULL,
 cause_details_audio TEXT NOT NULL,
 cause_location_audio TEXT,
 urgency TEXT NOT NULL DEFAULT 'normal',
 fingerprint CHAR(64) NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected')),
 reviewed_by INTEGER REFERENCES public.users(id),
 staff_note TEXT,
 reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gavhah_daily_phone_nominations_queue
 ON public.gavhah_daily_phone_nominations(status,created_at DESC);
