-- Olam MAX "קאנטאקט'ס" — add-only, reuse the SAME Neon contacts and call records.
-- Apply on isolated Neon staging first. No provider switching, no deletion, no autodynamics.
ALTER TABLE public.communication_contacts ADD COLUMN IF NOT EXISTS contact_ref integer;
ALTER TABLE public.communication_contacts ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS communication_contacts_owner_ref_unique
 ON public.communication_contacts(user_id,contact_ref) WHERE contact_ref IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.max_contact_id_sequence(
 user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 last_ref integer NOT NULL DEFAULT 0
);
WITH numbered AS (
 SELECT id,user_id,row_number() OVER(PARTITION BY user_id ORDER BY id)::integer AS seq
 FROM public.communication_contacts
) UPDATE public.communication_contacts c SET contact_ref=n.seq
 FROM numbered n WHERE c.id=n.id AND c.contact_ref IS NULL;
INSERT INTO public.max_contact_id_sequence(user_id,last_ref)
 SELECT user_id,max(contact_ref) FROM public.communication_contacts WHERE contact_ref IS NOT NULL GROUP BY user_id
 ON CONFLICT(user_id) DO UPDATE SET last_ref=GREATEST(public.max_contact_id_sequence.last_ref,EXCLUDED.last_ref);

CREATE TABLE IF NOT EXISTS public.max_contact_call_events(
 id bigserial PRIMARY KEY,
 user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 contact_id integer NOT NULL REFERENCES public.communication_contacts(id) ON DELETE CASCADE,
 call_session_id bigint REFERENCES public.max_call_sessions(id) ON DELETE SET NULL,
 event_key text,
 call_at timestamptz NOT NULL DEFAULT now(),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 direction text NOT NULL DEFAULT 'outbound' CHECK(direction IN ('inbound','outbound')),
 source text NOT NULL CHECK(source IN ('signalwire','yemot','manual','import')),
 outcome text NOT NULL DEFAULT '',
 purpose_type text NOT NULL DEFAULT 'none' CHECK(purpose_type IN ('none','case','campaign','project')),
 purpose_key text,
 details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS max_contact_call_history
 ON public.max_contact_call_events(user_id,contact_id,recorded_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS max_contact_call_dates
 ON public.max_contact_call_events(user_id,call_at DESC,contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS max_contact_call_event_idempotency
 ON public.max_contact_call_events(user_id,event_key) WHERE event_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.max_contact_recontact_plans (
 id bigserial PRIMARY KEY,
 user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 contact_id integer NOT NULL REFERENCES public.communication_contacts(id) ON DELETE CASCADE,
 scope text NOT NULL CHECK (scope IN ('same_purpose','new_purpose','person')),
 purpose_type text NOT NULL DEFAULT 'none' CHECK(purpose_type IN ('none','case','campaign','project')),
 purpose_key text NOT NULL DEFAULT '',
 interval_months integer CHECK(interval_months BETWEEN 1 AND 120),
 next_allowed_at timestamptz NOT NULL,
 note text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,contact_id,scope,purpose_type,purpose_key)
);
CREATE INDEX IF NOT EXISTS max_contact_recontact_due
 ON public.max_contact_recontact_plans(user_id,next_allowed_at,contact_id);
