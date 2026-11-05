CREATE TABLE IF NOT EXISTS public.gavhah_daily_cause_proposals (
 id BIGSERIAL PRIMARY KEY,
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 title TEXT NOT NULL,
 description TEXT NOT NULL,
 location TEXT,
 urgency TEXT NOT NULL CHECK(urgency IN('normal','high','urgent')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','reviewing','approved','rejected')),
 reviewed_by INTEGER REFERENCES public.users(id),
 review_note TEXT,
 reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gavhah_daily_cause_proposals_queue
 ON public.gavhah_daily_cause_proposals(status,created_at DESC);
-- Today's Cause cases need their own restricted collaborator permissions.
CREATE TABLE IF NOT EXISTS public.gavhah_daily_case_access (
 case_id INTEGER NOT NULL REFERENCES public.askanus_cases(id) ON DELETE CASCADE,
 collaborator_id INTEGER NOT NULL REFERENCES public.users(id),
 role TEXT NOT NULL CHECK(role IN('viewer','coordinator')),
 expires_at TIMESTAMPTZ NOT NULL,
 granted_by INTEGER NOT NULL REFERENCES public.users(id),
 revoked_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(case_id,collaborator_id)
);
CREATE TABLE IF NOT EXISTS public.gavhah_daily_campaign_center_links (
 charity_id INTEGER NOT NULL REFERENCES public.charities(id),
 provider TEXT NOT NULL DEFAULT 'campaign_center',
 campaign_reference TEXT NOT NULL,
 plan_code TEXT NOT NULL,
 linked_by INTEGER NOT NULL REFERENCES public.users(id),
 status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN('prepared','linked','disabled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(charity_id,provider)
);
