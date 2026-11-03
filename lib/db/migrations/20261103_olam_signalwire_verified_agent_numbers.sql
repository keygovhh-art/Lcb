-- One verified destination to ring the member FIRST; only after that answer
-- does SignalWire dial their authorized donor. Not a phone number ownership API.
-- Do not apply before staging checks and owner-reviewed production backup.
CREATE TABLE IF NOT EXISTS public.gavhah_olam_signalwire_agent_numbers(
 user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
 verified_at timestamptz NOT NULL,
 verified_by integer NOT NULL REFERENCES public.users(id),
 verification_note text NOT NULL CHECK (char_length(verification_note) >= 12),
 revoked_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gavhah_olam_agent_active_idx
 ON public.gavhah_olam_signalwire_agent_numbers(user_id)
 WHERE revoked_at IS NULL;
COMMENT ON TABLE public.gavhah_olam_signalwire_agent_numbers
 IS 'Verified callback phones for owner-approved Olam SignalWire users. No phone number from an arbitrary session or form is dialable.';
