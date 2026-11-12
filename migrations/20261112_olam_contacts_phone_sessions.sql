-- The already-verified Yemot/SignalWire session provides uid and opaque hashed Call ID.
-- This table does not authenticate users and must never be exposed unauthenticated.
CREATE TABLE IF NOT EXISTS public.max_contact_voice_sessions(
 call_hash text PRIMARY KEY,
 user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK(provider IN ('yemot','signalwire')),
 state jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS max_contact_voice_sessions_owner ON public.max_contact_voice_sessions(user_id,updated_at DESC);
