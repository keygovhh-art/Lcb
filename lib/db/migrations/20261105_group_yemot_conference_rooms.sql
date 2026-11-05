-- Gavhah Group Center, independent Yemot conference rooms.
-- Phone calls and outbound dialing remain SignalWire; Yemot is conferencing only.
-- Additive tables, no alteration of existing global Hitkabtzu room, no provider changes.
CREATE TABLE IF NOT EXISTS public.group_conference_rooms (
  group_id integer PRIMARY KEY REFERENCES public.groups(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'yemot' CHECK(provider = 'yemot'),
  provider_state text NOT NULL DEFAULT 'unconfigured'
    CHECK(provider_state IN ('unconfigured','provisioning','provider_accepted','needs_review')),
  enabled boolean NOT NULL DEFAULT false,
  provider_line text,
  listener_extension text,
  moderator_extension text,
  member_pin_sealed text,
  moderator_pin_sealed text,
  mode text NOT NULL DEFAULT 'speech' CHECK(mode IN ('speech','listen_all')),
  access_mode text NOT NULL DEFAULT 'members' CHECK(access_mode IN ('members','public')),
  provider_checked_at timestamptz,
  last_error text,
  updated_by integer REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (listener_extension IS NULL OR listener_extension ~ '^/[0-9]{3}$'),
  CHECK (moderator_extension IS NULL OR moderator_extension ~ '^/[0-9]{3}$'),
  CHECK (listener_extension IS NULL OR moderator_extension IS NULL OR listener_extension <> moderator_extension),
  CHECK (NOT enabled OR (provider_state = 'provider_accepted' AND provider_checked_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS group_conference_listener_extension_unique
  ON public.group_conference_rooms (listener_extension)
  WHERE listener_extension IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS group_conference_moderator_extension_unique
  ON public.group_conference_rooms (moderator_extension)
  WHERE moderator_extension IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.group_conference_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  group_id integer NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  actor_member_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 3 AND 60),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_conference_events_group_time_idx
  ON public.group_conference_events (group_id, created_at DESC);

-- Explicitly queued one-time Cloudflare infrastructure provisioning requests.
-- This is never a public phone dial-out campaign. A failed write is never retried blindly.
CREATE TABLE IF NOT EXISTS public.group_conference_provision_queue (
  group_id integer PRIMARY KEY REFERENCES public.groups(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'speech' CHECK(mode IN ('speech','listen_all')),
  state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','working','done','failed')),
  last_error text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_conference_provision_queue_state_idx
  ON public.group_conference_provision_queue(state, requested_at);
