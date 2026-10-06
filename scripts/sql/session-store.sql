-- Optional, additive setup only. Run manually against the chosen destination
-- PostgreSQL database BEFORE enabling SESSION_STORE=postgres.
-- This script never changes application tables or copies/deletes their data.
BEGIN;
CREATE TABLE IF NOT EXISTS public.app_sessions (
  sid text PRIMARY KEY,
  sess jsonb NOT NULL,
  expire timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS app_sessions_expire_idx ON public.app_sessions (expire);
COMMIT;
