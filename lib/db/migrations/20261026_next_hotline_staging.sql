-- Add-only. Prepares a replacement inbound hotline WITHOUT moving any Gavhah
-- members, MAX donor data, news, call logs, media references or IVR menus.
-- This is an isolated TEST connector, not authorization to switch live traffic.
CREATE TABLE IF NOT EXISTS public.gavhah_hotline_migration (
 id smallint PRIMARY KEY DEFAULT 1 CHECK(id=1),
 provider_kind text NOT NULL CHECK(provider_kind IN ('signalwire','yemot','other')),
 provider_label text NOT NULL,
 candidate_number text NOT NULL DEFAULT '',
 stage text NOT NULL DEFAULT 'draft' CHECK(stage IN ('draft','testing')),
 callback_hash text CHECK(callback_hash IS NULL OR callback_hash ~ '^[a-f0-9]{64}$'),
 generation text NOT NULL,
 test_started_at timestamptz,
 last_test_at timestamptz,
 tested_calls integer NOT NULL DEFAULT 0,
 updated_by integer NOT NULL REFERENCES public.users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.gavhah_hotline_migration_probes (
 generation text NOT NULL,
 call_hash text NOT NULL CHECK(call_hash ~ '^[a-f0-9]{64}$'),
 first_seen_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (generation,call_hash)
);
CREATE INDEX IF NOT EXISTS gavhah_migration_probes_time_idx
 ON public.gavhah_hotline_migration_probes(first_seen_at DESC);
REVOKE ALL ON public.gavhah_hotline_migration FROM PUBLIC;
REVOKE ALL ON public.gavhah_hotline_migration_probes FROM PUBLIC;
COMMENT ON TABLE public.gavhah_hotline_migration IS
 'Next Olam Hachesed inbound hotline STAGING configuration only. Production Yemot settings and existing call routing are untouched.';
