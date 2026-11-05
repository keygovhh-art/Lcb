-- One shared Gavhah "התקבצו" room; lecturer and assembly buttons never
-- create distinct rooms. No caller-ID-derived conference privileges.
CREATE TABLE IF NOT EXISTS public.gavhah_unified_conference (
 id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(id=1),
 name TEXT NOT NULL DEFAULT 'התקבצו — גבהה קאנפרענץ',
 description TEXT NOT NULL DEFAULT '',
 provider TEXT NOT NULL DEFAULT 'yemot' CHECK(provider='yemot'),
 provider_room_key TEXT NOT NULL DEFAULT 'gavhah-one-room',
 listener_extension TEXT,
 moderator_extension TEXT,
 provider_confirmed BOOLEAN NOT NULL DEFAULT false,
 enabled BOOLEAN NOT NULL DEFAULT false,
 mode TEXT NOT NULL DEFAULT 'lecture' CHECK(mode IN ('lecture','discussion','qa')),
 entry_mode TEXT NOT NULL DEFAULT 'members' CHECK(entry_mode IN('members','whitelist')),
 entry_code_hash TEXT,
 waiting_room BOOLEAN NOT NULL DEFAULT true,
 recording_enabled BOOLEAN NOT NULL DEFAULT false,
 scheduled_start_at TIMESTAMPTZ,
 scheduled_end_at TIMESTAMPTZ,
 override_state TEXT NOT NULL DEFAULT 'schedule'
   CHECK(override_state IN('schedule','force_open','force_closed')),
 override_until TIMESTAMPTZ,
 max_participants INTEGER NOT NULL DEFAULT 100 CHECK(max_participants BETWEEN 2 AND 1000),
 updated_by INTEGER REFERENCES public.users(id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((listener_extension IS NULL OR listener_extension ~ '^/[0-9]+(/[0-9]+)*$')
   AND (moderator_extension IS NULL OR moderator_extension ~ '^/[0-9]+(/[0-9]+)*$')),
 CHECK(listener_extension IS NULL OR moderator_extension IS NULL
   OR listener_extension <> moderator_extension)
);
INSERT INTO public.gavhah_unified_conference(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.gavhah_unified_conference_access (
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 access TEXT NOT NULL CHECK(access IN('blacklist','whitelist','speaker','moderator')),
 note TEXT NOT NULL DEFAULT '',
 set_by INTEGER REFERENCES public.users(id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(member_id,access)
);
CREATE TABLE IF NOT EXISTS public.gavhah_unified_conference_hand_requests (
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 state TEXT NOT NULL DEFAULT 'raised' CHECK(state IN('raised','approved','dismissed')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 decided_by INTEGER REFERENCES public.users(id),
 decided_at TIMESTAMPTZ,
 PRIMARY KEY(member_id)
);
CREATE TABLE IF NOT EXISTS public.gavhah_unified_conference_events (
 id BIGSERIAL PRIMARY KEY,
 actor_member_id INTEGER REFERENCES public.users(id),
 event_type TEXT NOT NULL,
 details JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gavhah_unified_conference_events_time_idx
 ON public.gavhah_unified_conference_events(created_at DESC);
-- Important: enabling the row does not provision Yemot confbridge extensions.
-- provider_confirmed may only be set after a verified provider test.
