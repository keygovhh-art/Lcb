-- ONE Olam MAX Contacts system across website / Yemot / SignalWire.
-- Apply to staging, verify with simulated calls, then apply additively to production.
-- NEVER use "no_answer" for an unfilled call report; blank stays unrecorded.
-- Phone owner-scoped sequential identifiers are separate from internal PKs.
ALTER TABLE public.communication_contacts ADD COLUMN IF NOT EXISTS contact_number bigint;
ALTER TABLE public.communication_contacts ADD COLUMN IF NOT EXISTS hidden_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS max_contact_owner_number_unique
 ON public.communication_contacts(user_id,contact_number) WHERE contact_number IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.max_contact_number_counters(
 user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 next_number bigint NOT NULL CHECK(next_number>=1));
WITH numbered AS (
 SELECT id,ROW_NUMBER() OVER(PARTITION BY user_id ORDER BY created_at,id) AS n
 FROM public.communication_contacts
) UPDATE public.communication_contacts c SET contact_number=n.n
 FROM numbered n WHERE c.id=n.id AND c.contact_number IS NULL;
INSERT INTO public.max_contact_number_counters(user_id,next_number)
 SELECT user_id,coalesce(max(contact_number),0)+1 FROM public.communication_contacts GROUP BY user_id
 ON CONFLICT(user_id) DO UPDATE SET
 next_number=GREATEST(public.max_contact_number_counters.next_number,EXCLUDED.next_number);
CREATE OR REPLACE FUNCTION public.max_assign_contact_number() RETURNS trigger
 LANGUAGE plpgsql AS $fn$
DECLARE n bigint;
BEGIN
 IF NEW.contact_number IS NULL THEN
  INSERT INTO public.max_contact_number_counters(user_id,next_number) VALUES(NEW.user_id,2)
  ON CONFLICT(user_id) DO UPDATE SET
   next_number=public.max_contact_number_counters.next_number+1
  RETURNING next_number-1 INTO n;
  NEW.contact_number:=n;
 END IF;
 RETURN NEW;
END; $fn$;
DROP TRIGGER IF EXISTS max_contact_assign_number ON public.communication_contacts;
CREATE TRIGGER max_contact_assign_number BEFORE INSERT ON public.communication_contacts
 FOR EACH ROW EXECUTE FUNCTION public.max_assign_contact_number();

CREATE TABLE IF NOT EXISTS public.max_call_status_revisions(
 id bigserial PRIMARY KEY,
 user_id integer NOT NULL REFERENCES public.users(id),
 call_id bigint NOT NULL REFERENCES public.max_call_sessions(id) ON DELETE CASCADE,
 contact_id integer REFERENCES public.communication_contacts(id),
 revision bigint NOT NULL,
 outcome text NOT NULL DEFAULT '',
 call_status text NOT NULL DEFAULT '',
 case_id integer REFERENCES public.askanus_cases(id),
 note text NOT NULL DEFAULT '',
 mood text NOT NULL DEFAULT '',
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(call_id,revision));
CREATE INDEX IF NOT EXISTS max_call_revisions_contact_recency
 ON public.max_call_status_revisions(user_id,contact_id,recorded_at DESC);

CREATE OR REPLACE FUNCTION public.max_assign_call_contact() RETURNS trigger
 LANGUAGE plpgsql AS $fn$
DECLARE n text; dest integer;
BEGIN
 IF NEW.contact_id IS NULL THEN
  n:=regexp_replace(coalesce(NEW.number_e164,''),'[^0-9]','','g');
  IF length(n)=11 AND left(n,1)='1' THEN n:=right(n,10); END IF;
  IF length(n)=10 AND n ~ '^[2-9][0-9]{2}[2-9][0-9]{6}$' THEN
   PERFORM pg_advisory_xact_lock(256718,NEW.user_id);
   SELECT id INTO dest FROM public.communication_contacts
    WHERE user_id=NEW.user_id
    AND right(regexp_replace(phone,'[^0-9]','','g'),10)=n
    ORDER BY id LIMIT 1;
   IF dest IS NULL THEN
    INSERT INTO public.communication_contacts(user_id,name,phone)
    VALUES(NEW.user_id,'',NEW.number_e164) RETURNING id INTO dest;
   END IF;
   NEW.contact_id:=dest;
  END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.communication_contacts
    WHERE id=NEW.contact_id AND user_id=NEW.user_id) THEN
   RAISE EXCEPTION 'contact must belong to call owner' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END; $fn$;
DROP TRIGGER IF EXISTS max_call_auto_contact ON public.max_call_sessions;
CREATE TRIGGER max_call_auto_contact BEFORE INSERT ON public.max_call_sessions
 FOR EACH ROW EXECUTE FUNCTION public.max_assign_call_contact();

CREATE OR REPLACE FUNCTION public.max_append_call_revision() RETURNS trigger
 LANGUAGE plpgsql AS $fn$
DECLARE v bigint;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.outcome IS NOT DISTINCT FROM OLD.outcome
   AND NEW.mood IS NOT DISTINCT FROM OLD.mood
   AND NEW.note IS NOT DISTINCT FROM OLD.note
   AND NEW.report_details IS NOT DISTINCT FROM OLD.report_details
   AND NEW.case_id IS NOT DISTINCT FROM OLD.case_id THEN
   RETURN NEW;
  END IF;
 END IF;
 SELECT coalesce(max(revision),0)+1 INTO v FROM public.max_call_status_revisions
 WHERE call_id=NEW.id;
 INSERT INTO public.max_call_status_revisions(
  user_id,call_id,contact_id,revision,outcome,call_status,case_id,note,mood,details)
 VALUES(NEW.user_id,NEW.id,NEW.contact_id,v,NEW.outcome,NEW.status,
  NEW.case_id,NEW.note,NEW.mood,coalesce(NEW.report_details,'{}'::jsonb));
 RETURN NEW;
END; $fn$;
DROP TRIGGER IF EXISTS max_call_append_revision ON public.max_call_sessions;
CREATE TRIGGER max_call_append_revision
 AFTER INSERT OR UPDATE OF outcome,mood,note,report_details,case_id
 ON public.max_call_sessions FOR EACH ROW
 EXECUTE FUNCTION public.max_append_call_revision();

INSERT INTO public.max_call_status_revisions(
 user_id,call_id,contact_id,revision,outcome,call_status,case_id,note,mood,details)
 SELECT user_id,id,contact_id,1,outcome,status,case_id,note,mood,
  coalesce(report_details,'{}'::jsonb)
 FROM public.max_call_sessions
 ON CONFLICT(call_id,revision) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.max_contact_recontact_rules(
 user_id integer NOT NULL REFERENCES public.users(id),
 contact_id integer NOT NULL REFERENCES public.communication_contacts(id) ON DELETE CASCADE,
 scope_type text NOT NULL CHECK(scope_type IN('person','case','campaign','project')),
 scope_id text NOT NULL DEFAULT '',
 interval_months integer CHECK(interval_months BETWEEN 1 AND 120),
 last_contact_at timestamptz,
 next_allowed_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,contact_id,scope_type,scope_id));
CREATE INDEX IF NOT EXISTS max_recontact_due
 ON public.max_contact_recontact_rules(user_id,next_allowed_at);
