-- STAGING ONLY. Requires explicit future publish approval and a production backup.
-- Existing records remain intact. NULL represents historical daily weekday times.
BEGIN;
ALTER TABLE public.minyans ADD COLUMN IF NOT EXISTS weekday_schedules jsonb;
COMMIT;
