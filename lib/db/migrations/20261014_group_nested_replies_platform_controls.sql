-- STAGING ONLY. Apply only after a fresh production backup and explicit release authorization.
-- Additive metadata. Preserve existing group settings, moderators, posts, replies, and membership.
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS platform_feature_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.group_post_replies
  ADD COLUMN IF NOT EXISTS parent_reply_id integer,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS group_post_replies_parent_idx
  ON public.group_post_replies(parent_reply_id);
-- This nullable self-reference keeps child replies alive if a parent is hard-deleted.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='group_post_replies_parent_fk'
  ) THEN
    ALTER TABLE public.group_post_replies
      ADD CONSTRAINT group_post_replies_parent_fk
      FOREIGN KEY (parent_reply_id) REFERENCES public.group_post_replies(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Platform-only protected member flag; group admins cannot modify it.
ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS protected_by_platform boolean NOT NULL DEFAULT false;
-- Individual platform staff grants. Default is zero privileges.
CREATE TABLE IF NOT EXISTS public.group_staff_access (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  group_id integer NOT NULL,
  can_view_private boolean NOT NULL DEFAULT false,
  can_moderate boolean NOT NULL DEFAULT false,
  granted_by integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id,group_id)
);
CREATE INDEX IF NOT EXISTS group_staff_access_user_idx ON public.group_staff_access(user_id);
CREATE TABLE IF NOT EXISTS public.group_access_audit (
  id bigserial PRIMARY KEY,
  actor_id integer NOT NULL,
  target_user_id integer,
  group_id integer,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_access_audit_created_idx ON public.group_access_audit(created_at);
