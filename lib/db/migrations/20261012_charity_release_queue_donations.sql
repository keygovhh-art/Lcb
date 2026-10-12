-- STAGED ONLY. Owner must authorize the release before applying on Neon.
-- Backward-compatible additions: old live campaigns remain unchanged.
-- Apply this migration after a Neon production backup and BEFORE the matching Render deploy.
-- Running twice is safe. No existing campaign or donation is deleted.
BEGIN;
ALTER TABLE public.charities
  ADD COLUMN IF NOT EXISTS publication_state text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS featured_from timestamptz,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS phone_extension text,
  ADD COLUMN IF NOT EXISTS phone_button_text text,
  ADD COLUMN IF NOT EXISTS donation_url text,
  ADD COLUMN IF NOT EXISTS link_button_text text,
  ADD COLUMN IF NOT EXISTS button_style text NOT NULL DEFAULT 'classic',
  ADD COLUMN IF NOT EXISTS button_layout text NOT NULL DEFAULT 'stacked',
  ADD COLUMN IF NOT EXISTS native_donation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS native_donation_button_text text,
  ADD COLUMN IF NOT EXISTS native_donation_button_style text NOT NULL DEFAULT 'gold';

-- Settings only; this does NOT implement a payment checkout or charge anyone.
CREATE TABLE IF NOT EXISTS public.charity_native_donation_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  default_button_text text NOT NULL DEFAULT 'Donate Securely',
  minimum_amount integer NOT NULL DEFAULT 1,
  maximum_amount integer NOT NULL DEFAULT 10000,
  suggested_amounts text NOT NULL DEFAULT '18,36,72,180',
  allow_custom_amount boolean NOT NULL DEFAULT true,
  allow_recurring boolean NOT NULL DEFAULT false,
  allow_anonymous boolean NOT NULL DEFAULT false,
  send_receipt boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS charities_publish_schedule_idx
  ON public.charities(publication_state, scheduled_at);
COMMIT;
