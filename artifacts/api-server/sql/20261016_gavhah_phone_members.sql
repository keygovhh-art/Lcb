-- STAGED ONLY: do not apply until explicit approved release.
-- Gavhah account authentication is entirely isolated from Campaign Center.
CREATE TABLE IF NOT EXISTS public.gavhah_phone_member_pins (
 user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 pin_index char(64) NOT NULL UNIQUE,
 pin_salt char(32) NOT NULL,
 pin_verifier char(128) NOT NULL,
 failed_attempts integer NOT NULL DEFAULT 0,
 locked_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 assigned_by integer REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS gavhah_phone_member_pin_lock ON public.gavhah_phone_member_pins(locked_until);
-- No cookie/session shared with cc_* or Neon Auth subject.
