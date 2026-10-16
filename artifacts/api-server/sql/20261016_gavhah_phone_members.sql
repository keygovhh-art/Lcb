-- STAGED ONLY: do not apply until explicit approved release.
-- Gavhah account authentication is entirely isolated from Campaign Center.
CREATE TABLE IF NOT EXISTS public.gavhah_phone_member_pins (
 user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 pin_index char(64) NOT NULL UNIQUE,
 pin_salt char(32) NOT NULL,
 pin_verifier char(128) NOT NULL,
 activation_required boolean NOT NULL DEFAULT false,
 failed_attempts integer NOT NULL DEFAULT 0,
 locked_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 assigned_by integer REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS gavhah_phone_member_pin_lock ON public.gavhah_phone_member_pins(locked_until);
-- No cookie/session shared with cc_* or Neon Auth subject.

-- Incoming telephone account applications never grant membership before the
-- contact is manually verified in Gavhah's own administration software.
CREATE TABLE IF NOT EXISTS public.gavhah_phone_join_requests (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 call_hash char(64) NOT NULL,
 contact_phone text NOT NULL,
 website_password_hash text NOT NULL,
 pin_index char(64) NOT NULL,
 pin_salt char(32) NOT NULL,
 pin_verifier char(128) NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 submitted_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 reviewed_by integer REFERENCES public.users(id) ON DELETE SET NULL,
 created_user_id integer REFERENCES public.users(id) ON DELETE SET NULL,
 UNIQUE(call_hash,contact_phone)
);
CREATE INDEX IF NOT EXISTS gavhah_phone_join_pending ON public.gavhah_phone_join_requests(status,submitted_at);
