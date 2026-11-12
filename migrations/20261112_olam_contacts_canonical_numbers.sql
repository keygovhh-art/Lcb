-- Exact E.164-style identity: same last 10 digits in different countries are NOT the same donor.
-- 10-digit North American numbers are canonicalized as +1. Local-only international
-- numbers without a country code cannot be safely matched.
CREATE OR REPLACE FUNCTION public.olam_max_normalized_number(v text)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE d text;
BEGIN
 d:=regexp_replace(v,'[^0-9]','','g');
 IF d ~ '^[2-9][0-9]{2}[2-9][0-9]{6}$' THEN RETURN '1'||d; END IF;
 IF d ~ '^1[2-9][0-9]{2}[2-9][0-9]{6}$' THEN RETURN d; END IF;
 IF left(trim(v),1)='+' AND d ~ '^[1-9][0-9]{7,14}$' THEN RETURN d; END IF;
 RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.olam_max_phone_equal(a text,b text)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT public.olam_max_normalized_number(a) IS NOT NULL
    AND public.olam_max_normalized_number(a)=public.olam_max_normalized_number(b)
$$;

CREATE OR REPLACE FUNCTION public.olam_max_attach_contact_before_call()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE saved integer;
BEGIN
 IF NEW.contact_id IS NOT NULL OR NEW.number_e164 IS NULL OR
  (NEW.status='prepared' AND COALESCE(NEW.outcome,'')='') THEN RETURN NEW; END IF;
 SELECT id INTO saved FROM public.communication_contacts
   WHERE user_id=NEW.user_id AND public.olam_max_phone_equal(phone,NEW.number_e164)
   ORDER BY id ASC LIMIT 1;
 IF saved IS NULL THEN
  PERFORM 1 FROM public.users WHERE id=NEW.user_id FOR UPDATE;
  SELECT id INTO saved FROM public.communication_contacts
   WHERE user_id=NEW.user_id AND public.olam_max_phone_equal(phone,NEW.number_e164)
   ORDER BY id ASC LIMIT 1;
  IF saved IS NULL THEN
   INSERT INTO public.communication_contacts(user_id,name,phone) VALUES(NEW.user_id,'',NEW.number_e164)
    RETURNING id INTO saved;
  END IF;
 END IF;
 IF saved IS NOT NULL THEN
  UPDATE public.communication_contacts SET archived_at=NULL,updated_at=now()
   WHERE id=saved AND user_id=NEW.user_id AND archived_at IS NOT NULL;
 END IF;
 NEW.contact_id:=saved;
 RETURN NEW;
END; $$;

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
  WHERE user_id=owner_id AND public.olam_max_phone_equal(phone,NEW.incoming_from)
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
