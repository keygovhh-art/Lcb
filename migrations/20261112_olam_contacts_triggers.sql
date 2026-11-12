-- Shared contact number allocator and automatic contact capture, staged only.
CREATE OR REPLACE FUNCTION public.olam_max_contact_ref_before_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ref integer;
BEGIN
  IF NEW.name IS NULL THEN NEW.name:=''; END IF;
  IF NEW.contact_ref IS NULL THEN
    INSERT INTO public.max_contact_id_sequence(user_id,last_ref)
     VALUES(NEW.user_id,GREATEST(1,COALESCE(
      (SELECT max(contact_ref)+1 FROM public.communication_contacts WHERE user_id=NEW.user_id),1)))
     ON CONFLICT(user_id) DO UPDATE
     SET last_ref=GREATEST(public.max_contact_id_sequence.last_ref+1,
      COALESCE((SELECT max(contact_ref)+1 FROM public.communication_contacts WHERE user_id=NEW.user_id),1))
     RETURNING last_ref INTO ref;
    NEW.contact_ref:=ref;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE TRIGGER olam_max_contact_ref_insert BEFORE INSERT ON public.communication_contacts
FOR EACH ROW EXECUTE FUNCTION public.olam_max_contact_ref_before_insert();

CREATE OR REPLACE FUNCTION public.olam_max_attach_contact_before_call()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE saved integer;
BEGIN
 IF NEW.contact_id IS NOT NULL OR NEW.number_e164 IS NULL OR
  (NEW.status='prepared' AND COALESCE(NEW.outcome,'')='') THEN RETURN NEW; END IF;
 SELECT id INTO saved FROM public.communication_contacts
   WHERE user_id=NEW.user_id AND right(regexp_replace(phone,'[^0-9]','','g'),10)=right(NEW.number_e164,10)
   ORDER BY id ASC LIMIT 1;
 IF saved IS NULL THEN
  PERFORM 1 FROM public.users WHERE id=NEW.user_id FOR UPDATE;
  SELECT id INTO saved FROM public.communication_contacts
   WHERE user_id=NEW.user_id AND right(regexp_replace(phone,'[^0-9]','','g'),10)=right(NEW.number_e164,10)
   ORDER BY id ASC LIMIT 1;
  IF saved IS NULL THEN
   INSERT INTO public.communication_contacts(user_id,name,phone) VALUES(NEW.user_id,'',NEW.number_e164)
    RETURNING id INTO saved;
  END IF;
 END IF;
 NEW.contact_id:=saved;
 RETURN NEW;
END; $$;

CREATE OR REPLACE TRIGGER olam_max_call_auto_contact
 BEFORE INSERT OR UPDATE OF status,outcome ON public.max_call_sessions
 FOR EACH ROW EXECUTE FUNCTION public.olam_max_attach_contact_before_call();

CREATE OR REPLACE FUNCTION public.olam_max_append_call_event()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_source text;
BEGIN
 IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.outcome IS NOT DISTINCT FROM NEW.outcome
   AND OLD.note IS NOT DISTINCT FROM NEW.note
   AND OLD.mood IS NOT DISTINCT FROM NEW.mood
   AND OLD.report_details IS NOT DISTINCT FROM NEW.report_details
   AND OLD.case_id IS NOT DISTINCT FROM NEW.case_id
   AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
 END IF;
 IF NEW.status='prepared' AND NEW.outcome='' THEN RETURN NEW; END IF;
 event_source:=CASE WHEN NEW.provider='manual' THEN 'manual'
   WHEN NEW.provider='yemot' THEN 'yemot'
   WHEN NEW.provider='signalwire' THEN 'signalwire' ELSE 'import' END;
 INSERT INTO public.max_contact_call_events
 (user_id,contact_id,call_session_id,event_key,call_at,direction,source,outcome,purpose_type,purpose_key,details)
 VALUES
 (NEW.user_id,NEW.contact_id,NEW.id,CASE WHEN TG_OP='INSERT' THEN 'initial-call:'||NEW.id ELSE NULL END,
  COALESCE(NEW.started_at,NEW.ended_at,NEW.created_at),NEW.direction,event_source,COALESCE(NEW.outcome,''),
  COALESCE(NEW.purpose_type,'none'),NEW.purpose_key,
  jsonb_build_object('report',NEW.report_details,'providerStatus',NEW.status,'mood',NEW.mood,'note',NEW.note));
 RETURN NEW;
END; $$;

CREATE OR REPLACE TRIGGER olam_max_call_status_append
 AFTER INSERT OR UPDATE OF status,outcome,note,mood,report_details,case_id
 ON public.max_call_sessions
 FOR EACH ROW EXECUTE FUNCTION public.olam_max_append_call_event();
