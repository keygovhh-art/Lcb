-- 2026-10-17: safe DTMF self-registration for the canonical Gavhah website.
-- No phone-number-as-identity; account credentials are a generated member
-- number prefixed M plus a caller-selected high-entropy numeric password.
CREATE TABLE IF NOT EXISTS public.gavhah_phone_member_logins (
 member_no varchar(10) PRIMARY KEY CHECK (member_no ~ '^[0-9]{10}$'),
 user_id integer NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gavhah_phone_member_logins_user ON public.gavhah_phone_member_logins(user_id);
CREATE TABLE IF NOT EXISTS public.gavhah_phone_signup_pending (
 call_hash varchar(64) PRIMARY KEY,
 password_hash text NOT NULL,
 expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gavhah_phone_signup_pending_expiry ON public.gavhah_phone_signup_pending(expires_at);
CREATE TABLE IF NOT EXISTS public.gavhah_phone_signup_events (
 id bigserial PRIMARY KEY,
 call_hash varchar(64) NOT NULL,
 user_id integer NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gavhah_phone_signup_events_time ON public.gavhah_phone_signup_events(created_at DESC);
CREATE INDEX IF NOT EXISTS gavhah_phone_signup_events_call ON public.gavhah_phone_signup_events(call_hash,created_at DESC);
COMMENT ON TABLE public.gavhah_phone_member_logins IS 'Gavhah website account login with M plus member number and numeric password; caller ID is not proof. Campaign Center Neon Auth remains separate.';
COMMENT ON TABLE public.gavhah_phone_signup_pending IS 'Only scrypt hashes, never raw phone-entered passwords. Provider DTMF logging must remain disabled.';
