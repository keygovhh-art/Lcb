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
  ADD COLUMN IF NOT EXISTS button_layout text NOT NULL DEFAULT 'stacked';
CREATE INDEX IF NOT EXISTS charities_publish_schedule_idx
  ON public.charities(publication_state, scheduled_at);
COMMIT;
