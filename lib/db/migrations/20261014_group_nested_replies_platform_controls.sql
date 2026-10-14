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
