-- STAGING ONLY; DO NOT APPLY UNTIL EXPLICIT USER PUBLISH AUTHORIZATION.
-- Future admin-created charity campaigns can be associated with the
-- authenticated creator's user ID, not a mutable name. Historical campaigns
-- have no reliable creator metadata, so are deliberately left NULL.
ALTER TABLE public.charities
  ADD COLUMN IF NOT EXISTS created_by_user_id integer;
