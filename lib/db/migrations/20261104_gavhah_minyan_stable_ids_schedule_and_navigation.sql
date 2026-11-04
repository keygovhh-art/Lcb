-- Gavhah minyan directory 3/4 digit stable dial IDs, verified place data,
-- member-only saved places, structured service rules, and private IVR intake.
-- Additive; no changes to existing minyans/schedules without admin review.
CREATE SEQUENCE IF NOT EXISTS public.gavhah_minyan_dial_seq
  AS INTEGER START WITH 1000 INCREMENT BY 1 MINVALUE 1000 MAXVALUE 9999 NO CYCLE;
CREATE TABLE IF NOT EXISTS public.gavhah_minyan_directory (
  minyan_id INTEGER PRIMARY KEY REFERENCES public.minyans(id) ON DELETE CASCADE,
  dial_code INTEGER NOT NULL UNIQUE CHECK (dial_code BETWEEN 100 AND 9999),
  latitude DOUBLE PRECISION CHECK(latitude BETWEEN -90 AND 90),
  longitude DOUBLE PRECISION CHECK(longitude BETWEEN -180 AND 180),
  address_verified BOOLEAN NOT NULL DEFAULT FALSE,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  verified_by INTEGER REFERENCES public.users(id),
  verified_at TIMESTAMPTZ,
  last_schedule_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR
         (latitude IS NOT NULL AND longitude IS NOT NULL))
);
CREATE OR REPLACE FUNCTION public.gavhah_assign_minyan_dial()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='approved' THEN
  INSERT INTO public.gavhah_minyan_directory(minyan_id,dial_code)
  VALUES(NEW.id,nextval('public.gavhah_minyan_dial_seq')) 
  ON CONFLICT(minyan_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
-- Add the trigger once; never remove or replace an existing production trigger.
DO $$
BEGIN
 IF NOT EXISTS(
   SELECT 1 FROM pg_trigger WHERE tgrelid='public.minyans'::regclass
     AND tgname='gavhah_minyan_dial_on_approved' AND NOT tgisinternal
 ) THEN
  CREATE TRIGGER gavhah_minyan_dial_on_approved
   AFTER INSERT OR UPDATE OF status ON public.minyans FOR EACH ROW
   EXECUTE FUNCTION public.gavhah_assign_minyan_dial();
 END IF;
END $$;
-- Existing approved locations receive codes; pending locations get no codes.
INSERT INTO public.gavhah_minyan_directory(minyan_id,dial_code)
SELECT m.id,nextval('public.gavhah_minyan_dial_seq')
FROM public.minyans m
WHERE m.status='approved'
  AND NOT EXISTS(SELECT 1 FROM public.gavhah_minyan_directory d WHERE d.minyan_id=m.id)
ORDER BY m.id
ON CONFLICT(minyan_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.gavhah_minyan_service_rules (
 id BIGSERIAL PRIMARY KEY,
 minyan_id INTEGER NOT NULL REFERENCES public.minyans(id) ON DELETE CASCADE,
 prayer TEXT NOT NULL CHECK(prayer IN ('shacharis','mincha','maariv','mincha_maariv')),
 week_day SMALLINT NOT NULL CHECK(week_day BETWEEN 0 AND 6),
 local_time TIME WITHOUT TIME ZONE,
 rabeinu_tam_offset_min SMALLINT CHECK(rabeinu_tam_offset_min BETWEEN 0 AND 240),
 recurrence_minutes SMALLINT CHECK(recurrence_minutes BETWEEN 5 AND 240),
 until_local_time TIME WITHOUT TIME ZONE,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 submitted_by_user_id INTEGER REFERENCES public.users(id),
 approved_by INTEGER REFERENCES public.users(id),
 approved_at TIMESTAMPTZ,
 CHECK ((local_time IS NOT NULL AND rabeinu_tam_offset_min IS NULL)
   OR (local_time IS NULL AND rabeinu_tam_offset_min IS NOT NULL)),
 CHECK ((recurrence_minutes IS NULL AND until_local_time IS NULL)
   OR (recurrence_minutes IS NOT NULL AND until_local_time IS NOT NULL AND local_time IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS gavhah_minyan_service_rules_schedule_idx
 ON public.gavhah_minyan_service_rules(minyan_id,week_day,prayer);
CREATE TABLE IF NOT EXISTS public.gavhah_minyan_saved_places (
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 minyan_id INTEGER NOT NULL REFERENCES public.minyans(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(member_id,minyan_id)
);
CREATE INDEX IF NOT EXISTS gavhah_minyan_saved_places_lookup_idx
 ON public.gavhah_minyan_saved_places(minyan_id);
CREATE TABLE IF NOT EXISTS public.gavhah_minyan_phone_submissions (
 id BIGSERIAL PRIMARY KEY,
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 synagogue_audio TEXT,
 synagogue_typed TEXT,
 city TEXT,
 city_audio TEXT,
 address_audio TEXT,
 address_typed TEXT,
 schedule_json JSONB NOT NULL DEFAULT '[]'::jsonb,
 notes_audio TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','reviewing','approved','rejected')),
 reviewed_minya_id INTEGER REFERENCES public.minyans(id),
 reviewed_by INTEGER REFERENCES public.users(id),
 review_notes TEXT,
 reviewed_at TIMESTAMPTZ,
 request_key TEXT NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK ((synagogue_audio IS NOT NULL OR synagogue_typed IS NOT NULL)),
 CHECK ((address_audio IS NOT NULL OR address_typed IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS gavhah_minyan_phone_submissions_status
 ON public.gavhah_minyan_phone_submissions(status,created_at DESC);
CREATE TABLE IF NOT EXISTS public.gavhah_minyan_trip_plans (
 id BIGSERIAL PRIMARY KEY,
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 start_address TEXT NOT NULL,
 start_lat DOUBLE PRECISION,
 start_lng DOUBLE PRECISION,
 start_time TIMESTAMPTZ NOT NULL,
 travel_mode TEXT NOT NULL CHECK(travel_mode IN('driving','walking')),
 skipped_minya_ids INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
 preferred_minya_id INTEGER REFERENCES public.minyans(id),
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN('draft','active','finished','cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gavhah_minyan_trip_plans_member
 ON public.gavhah_minyan_trip_plans(member_id,updated_at DESC);
