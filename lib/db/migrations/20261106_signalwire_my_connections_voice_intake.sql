-- Authenticated SignalWire-only recorded volunteer and help intake.
-- Never use Yemot to originate ordinary phone calls or modify the Olam hotline.
-- Only privately held staff-review references are stored: no public publication.
CREATE TABLE IF NOT EXISTS public.gavhah_signalwire_form_intake (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 member_id integer NOT NULL REFERENCES public.users(id),
 kind text NOT NULL CHECK(kind IN ('volunteer','help')),
 call_hash text NOT NULL,
 recording_sid text NOT NULL UNIQUE,
 recording_url text NOT NULL,
 recording_duration_seconds integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'needs_transcription'
   CHECK(status IN ('needs_transcription','reviewing','completed','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by integer REFERENCES public.users(id),
 reviewed_at timestamptz,
 staff_notes text
);
CREATE INDEX IF NOT EXISTS gavhah_signalwire_form_intake_member_time_idx
 ON public.gavhah_signalwire_form_intake(member_id,created_at DESC);
