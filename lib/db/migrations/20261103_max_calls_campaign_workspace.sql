-- Staged only. Does not alter phone routing or record audio.
CREATE TABLE IF NOT EXISTS public.max_call_preferences(
 user_id integer PRIMARY KEY,
 last_case_id integer REFERENCES public.askanus_cases(id) ON DELETE SET NULL,
 hold_mode text NOT NULL DEFAULT 'gavhah' CHECK(hold_mode IN ('gavhah','message','audio')),
 hold_message text NOT NULL DEFAULT '',
 hold_audio_path text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.max_call_sessions(
 id bigserial PRIMARY KEY,
 user_id integer NOT NULL,
 case_id integer REFERENCES public.askanus_cases(id) ON DELETE SET NULL,
 contact_id integer REFERENCES public.communication_contacts(id) ON DELETE SET NULL,
 number_e164 text NOT NULL CHECK (number_e164 ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
 destination_country text NOT NULL CHECK(destination_country IN ('US','CA')),
 direction text NOT NULL DEFAULT 'outbound' CHECK(direction IN ('outbound','inbound')),
 status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','initiating','ringing','in_progress','completed','failed','busy','no_answer','canceled')),
 provider text NOT NULL DEFAULT 'signalwire',
 provider_call_id text,
 started_at timestamptz,
 answered_at timestamptz,
 ended_at timestamptz,
 duration_seconds integer CHECK(duration_seconds>=0),
 participant_count integer NOT NULL DEFAULT 0 CHECK(participant_count BETWEEN 0 AND 3),
 outcome text NOT NULL DEFAULT '',
 mood text NOT NULL DEFAULT '',
 note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS max_call_sessions_owner_created_idx ON public.max_call_sessions(user_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS max_call_sessions_provider_id_unique ON public.max_call_sessions(provider,provider_call_id) WHERE provider_call_id IS NOT NULL;
COMMENT ON TABLE public.max_call_sessions IS 'Status prepared means call intent only, not an actual telephone call. Real duration/direction require verified provider callbacks.';