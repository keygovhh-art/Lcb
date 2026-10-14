-- STAGING ONLY. Apply after verified Neon backup, before a later approved deploy.
-- Additive / idempotent. Old posts remain approved and previously saved counts persist.
BEGIN;
ALTER TABLE public.groups
 ADD COLUMN IF NOT EXISTS allow_replies boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS reply_approval boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS post_approval boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS members_can_post boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS members_can_reply boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS show_view_counts boolean NOT NULL DEFAULT true,
 ADD COLUMN IF NOT EXISTS allow_downvotes boolean NOT NULL DEFAULT false;
ALTER TABLE public.group_posts
 ADD COLUMN IF NOT EXISTS downvotes integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'approved',
 ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.group_post_views (
 id serial PRIMARY KEY,
 post_id integer NOT NULL REFERENCES public.group_posts(id) ON DELETE CASCADE,
 user_id integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT group_post_views_post_user_unique UNIQUE(post_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.group_post_downvotes (
 id serial PRIMARY KEY,
 post_id integer NOT NULL REFERENCES public.group_posts(id) ON DELETE CASCADE,
 user_id integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT group_post_downvotes_post_user_unique UNIQUE(post_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.group_post_replies (
 id serial PRIMARY KEY,
 post_id integer NOT NULL REFERENCES public.group_posts(id) ON DELETE CASCADE,
 author_id integer NOT NULL,
 author_name text NOT NULL,
 content text NOT NULL,
 moderation_status text NOT NULL DEFAULT 'approved',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_post_replies_post_idx ON public.group_post_replies(post_id);
CREATE TABLE IF NOT EXISTS public.group_post_reports (
 id serial PRIMARY KEY,
 -- Retain team report records and evidence after reported content is deleted.
 group_id integer NOT NULL,
 post_id integer NOT NULL,
 reporter_id integer NOT NULL,
 reason text NOT NULL,
 post_excerpt text NOT NULL DEFAULT '',
 to_group boolean NOT NULL,
 to_staff boolean NOT NULL,
 group_status text NOT NULL DEFAULT 'open',
 staff_status text NOT NULL DEFAULT 'open',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS group_reports_post_reporter_unique ON public.group_post_reports(post_id,reporter_id);
CREATE INDEX IF NOT EXISTS group_reports_group_target_idx ON public.group_post_reports(group_id,to_group,created_at);
CREATE INDEX IF NOT EXISTS group_reports_staff_target_idx ON public.group_post_reports(to_staff,created_at);
COMMIT;
