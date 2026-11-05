-- Independent United in Kindness and Daily Cause configuration.
-- Additive migration: does not change SignalWire, existing donations, causes, or memberships.
CREATE TABLE IF NOT EXISTS public.gavhah_cause_channels (
 channel TEXT PRIMARY KEY CHECK (channel IN ('united','daily')),
 enabled BOOLEAN NOT NULL DEFAULT false,
 active_charity_id INTEGER REFERENCES public.charities(id) ON DELETE SET NULL,
 phone_before_news BOOLEAN NOT NULL DEFAULT false,
 website_before_news BOOLEAN NOT NULL DEFAULT false,
 website_autoplay BOOLEAN NOT NULL DEFAULT false,
 announcement_mode TEXT NOT NULL DEFAULT 'tts' CHECK(announcement_mode IN ('tts','recording')),
 join_mode TEXT NOT NULL DEFAULT 'tts' CHECK(join_mode IN ('tts','recording')),
 donation_hotline TEXT,
 donation_instructions_en TEXT NOT NULL DEFAULT '',
 payment_adapter TEXT NOT NULL DEFAULT 'none' CHECK(payment_adapter IN ('none','hosted_checkout')),
 checkout_url TEXT,
 updated_by INTEGER REFERENCES public.users(id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT cause_channel_checkout_https CHECK(checkout_url IS NULL OR checkout_url ~ '^https://[^[:space:]]+$')
);
INSERT INTO public.gavhah_cause_channels(channel,enabled)
VALUES ('united',true),('daily',false)
ON CONFLICT(channel) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.gavhah_cause_messages (
 channel TEXT NOT NULL REFERENCES public.gavhah_cause_channels(channel),
 purpose TEXT NOT NULL CHECK(purpose IN ('announcement','join')),
 text_en TEXT NOT NULL DEFAULT '',
 audio_data BYTEA,
 mime_type TEXT,
 phone_audio_path TEXT,
 approved_by INTEGER REFERENCES public.users(id),
 approved_at TIMESTAMPTZ,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(channel,purpose),
 CONSTRAINT cause_message_audio_together CHECK (
 (audio_data IS NULL AND mime_type IS NULL) OR (audio_data IS NOT NULL AND mime_type IS NOT NULL)
 )
);
INSERT INTO public.gavhah_cause_messages(channel,purpose)
VALUES ('united','announcement'),('united','join'),('daily','announcement'),('daily','join')
ON CONFLICT(channel,purpose) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.gavhah_cause_message_requests (
 id BIGSERIAL PRIMARY KEY,
 channel TEXT NOT NULL REFERENCES public.gavhah_cause_channels(channel),
 purpose TEXT NOT NULL CHECK(purpose IN ('announcement','join')),
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 requested_by INTEGER NOT NULL REFERENCES public.users(id),
 state TEXT NOT NULL DEFAULT 'requested' CHECK(state IN ('requested','submitted','approved','rejected')),
 proposed_text_en TEXT,
 proposed_audio BYTEA,
 proposed_mime_type TEXT,
 request_note TEXT NOT NULL DEFAULT '',
 review_note TEXT,
 reviewed_by INTEGER REFERENCES public.users(id),
 reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 submitted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS gavhah_cause_message_requests_member_idx
 ON public.gavhah_cause_message_requests(member_id,state,created_at DESC);
CREATE INDEX IF NOT EXISTS gavhah_cause_message_requests_team_idx
 ON public.gavhah_cause_message_requests(state,created_at DESC);

-- This is recorded/verified actual funds received, not the original
-- featured_causes.amount_raised (which currently includes uncollected pledges).
CREATE TABLE IF NOT EXISTS public.gavhah_united_verified_totals (
 cause_id INTEGER PRIMARY KEY REFERENCES public.featured_causes(id) ON DELETE CASCADE,
 verified_cents BIGINT NOT NULL DEFAULT 0 CHECK (verified_cents>=0),
 verification_note TEXT NOT NULL DEFAULT '',
 recorded_by INTEGER NOT NULL REFERENCES public.users(id),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phone cause nominations have voice fields; staff must transcribe into
-- the existing cause_submissions after approval review, never auto-public.
CREATE TABLE IF NOT EXISTS public.gavhah_phone4_nominations (
 id BIGSERIAL PRIMARY KEY,
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 cause_title_audio TEXT NOT NULL,
 cause_details_audio TEXT NOT NULL,
 cause_location_audio TEXT,
 urgency TEXT NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal','high','urgent')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 fingerprint CHAR(64) NOT NULL UNIQUE,
 staff_notes TEXT,
 reviewed_by INTEGER REFERENCES public.users(id),
 reviewed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gavhah_phone4_nominations_queue
 ON public.gavhah_phone4_nominations(status,created_at DESC);
