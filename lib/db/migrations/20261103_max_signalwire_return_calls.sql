-- Add-only, disabled-by-default inbound return-call feature.
-- Must run after 20261103_max_calls_campaign_workspace.sql.
CREATE TABLE IF NOT EXISTS public.max_return_call_preferences(
 user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false,
 availability text NOT NULL DEFAULT 'auto'
   CHECK (availability IN ('auto','unavailable')),
 public_display_name text NOT NULL DEFAULT '' CHECK(char_length(public_display_name)<=100),
 public_purpose text NOT NULL DEFAULT '' CHECK(char_length(public_purpose)<=150),
 unavailable_message text NOT NULL DEFAULT ''
   CHECK(char_length(unavailable_message)<=600),
 share_callback_number boolean NOT NULL DEFAULT false,
 callback_number_e164 text CHECK(callback_number_e164 IS NULL OR
    callback_number_e164 ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
 unavailable_audio_data bytea,
 unavailable_audio_version integer NOT NULL DEFAULT 1,
 unavailable_audio_enabled boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.max_agent_activity(
 user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
 channel text NOT NULL CHECK(channel IN ('olam','yemot')),
 last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.max_return_calls(
 id bigserial PRIMARY KEY,
 owner_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 source_session_id bigint NOT NULL REFERENCES public.max_call_sessions(id),
 provider_call_id text NOT NULL UNIQUE,
 incoming_from text NOT NULL CHECK(incoming_from ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
 status text NOT NULL DEFAULT 'menu'
   CHECK(status IN ('menu','connecting','voicemail','missed','completed','busy','unavailable')),
 purpose_text text NOT NULL DEFAULT '',
 agent_display_name text NOT NULL DEFAULT '',
 selected_digit text CHECK(selected_digit IS NULL OR selected_digit IN ('1','2')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes'
);
CREATE INDEX IF NOT EXISTS max_return_calls_agent_recent_idx
 ON public.max_return_calls(owner_user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.max_return_voicemails(
 id bigserial PRIMARY KEY,
 return_call_id bigint NOT NULL UNIQUE REFERENCES public.max_return_calls(id) ON DELETE CASCADE,
 owner_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 recording_sid text,
 duration_seconds integer CHECK(duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 180),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.max_return_alerts(
 id bigserial PRIMARY KEY,
 return_call_id bigint NOT NULL REFERENCES public.max_return_calls(id) ON DELETE CASCADE,
 owner_user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('incoming','busy','yemot','voicemail','missed')),
 phone_last4 text NOT NULL DEFAULT '',
 is_read boolean NOT NULL DEFAULT false,
 olam_chime_delivered boolean NOT NULL DEFAULT false,
 yemot_announcement_delivered boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(return_call_id,kind)
);
CREATE INDEX IF NOT EXISTS max_return_alerts_unread_idx
 ON public.max_return_alerts(owner_user_id,created_at DESC) WHERE is_read=false;
COMMENT ON TABLE public.max_return_calls IS 'Return calls matched from SignalWire authenticated webhook + prior actual outbound call, never from prepared phone intents. Caller-ID is not authentication.';
COMMENT ON TABLE public.max_return_voicemails IS 'Only caller-initiated voicemail; complete phone conversations are NOT recorded.';
