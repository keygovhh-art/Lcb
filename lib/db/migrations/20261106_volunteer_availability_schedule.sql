-- Additional volunteer availability schedule; existing profiles and requests remain unchanged.
ALTER TABLE public.volunteer_profiles
  ADD COLUMN IF NOT EXISTS availability_schedule jsonb NOT NULL DEFAULT '{}'::jsonb;
-- The website no longer asks for a City/Community. The legacy location field
-- remains for historical reports, but new volunteer applications use ''.
ALTER TABLE public.volunteer_profiles ALTER COLUMN location SET DEFAULT '';
