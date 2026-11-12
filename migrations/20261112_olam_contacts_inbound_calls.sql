-- MAX Contacts: include trusted SignalWire return calls in the canonical
-- Contacts list. This is append-only and never guesses an unanswered outcome.
-- max_return_calls/max_return_alerts already exist on production. New tables
-- below are used only if the old staging branch did not yet contain them.
CREATE TABLE IF NOT EXISTS public.max_return_calls(
 id bigserial PRIMARY KEY,
 owner_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 source_session_id bigint REFERENCES public.max_call_sessions(id) ON DELETE SET NULL,
 provider_call_id text NOT NULL DEFAULT '',
 incoming_from text NOT NULL,
 status text NOT NULL DEFAULT 'menu',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.max_return_alerts(
 id bigserial PRIMARY KEY,
 return_call_id bigint NOT NULL REFERENCES public.max_return_calls(id) ON DELETE CASCADE,
 owner_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 kind text NOT NULL,
 phone_last4 text NOT NULL DEFAULT '',
 is_read boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(return_call_id,kind)
);

CREATE OR REPLACE FUNCTION public.olam_max_return_call_contact()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_id integer; contact_id integer; normalized text;
BEGIN
 normalized:=regexp_replace(COALESCE(NEW.incoming_from,''),'[^0-9]','','g');
 IF length(normalized)=11 AND left(normalized,1)='1' THEN normalized:=right(normalized,10); END IF;
 IF normalized !~ '^[2-9][0-9]{2}[2-9][0-9]{6}$' THEN RETURN NEW; END IF;
 owner_id:=NEW.owner_user_id;
 PERFORM 1 FROM public.users WHERE id=owner_id FOR UPDATE;
 SELECT id INTO contact_id FROM public.communication_contacts
  WHERE user_id=owner_id AND right(regexp_replace(phone,'[^0-9]','','g'),10)=normalized
  ORDER BY id LIMIT 1;
 IF contact_id IS NULL THEN
  INSERT INTO public.communication_contacts(user_id,name,phone)
   VALUES(owner_id,'','+1'||normalized) RETURNING id INTO contact_id;
 END IF;
 UPDATE public.communication_contacts SET archived_at=NULL,updated_at=now()
  WHERE id=contact_id AND user_id=owner_id AND archived_at IS NOT NULL;
 INSERT INTO public.max_contact_call_events(
  user_id,contact_id,call_session_id,event_key,call_at,direction,source,outcome,
  purpose_type,purpose_key,details
 ) VALUES(
  owner_id,contact_id,NULL,'return-call:'||NEW.id,COALESCE(NEW.created_at,now()),'inbound','signalwire','',
  'none',NULL,jsonb_build_object('source','max_return_calls','returnCallId',NEW.id,'providerStatus',NEW.status)
 ) ON CONFLICT(user_id,event_key) WHERE event_key IS NOT NULL DO NOTHING;
 RETURN NEW;
END; $$;

CREATE OR REPLACE TRIGGER olam_max_return_call_contact_created
 AFTER INSERT ON public.max_return_calls
 FOR EACH ROW EXECUTE FUNCTION public.olam_max_return_call_contact();
