-- STAGED ONLY — owner must authorize Neon schema changes and Render deploy.
-- Safe additive migration; preserves all original cases, logs and supporters.
BEGIN;
ALTER TABLE public.askanus_cases
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id integer;
CREATE UNIQUE INDEX IF NOT EXISTS askanus_case_official_source_unique
  ON public.askanus_cases(user_id, source_type, source_id)
  WHERE source_type IS NOT NULL;

-- Import each existing official featured-cause membership exactly once.
-- Funds promised or public raised are NOT counted as this member's funds received.
INSERT INTO public.askanus_cases
  (user_id,title,description,status,urgency,category,contact_name,
   funds_promised,funds_received,goal_amount,notes,source_type,source_id)
SELECT DISTINCT ON (s.user_id,s.cause_id)
  s.user_id,left(c.title,240),left(c.description,5000),
  'open'::askanus_status,'medium'::askanus_urgency,'General',
  left(coalesce(c.organizer_name,''),240),0,0,0,
  'Official community cause joined. Track your own actions and follow-ups here.',
  'featured_cause',s.cause_id
FROM public.featured_cause_supporters s
JOIN public.featured_causes c ON c.id=s.cause_id
WHERE s.user_id>0 AND c.status <> 'pending'
ORDER BY s.user_id,s.cause_id,s.created_at
ON CONFLICT DO NOTHING;

-- Import each existing joined community project or organizer once.
INSERT INTO public.askanus_cases
  (user_id,title,description,status,urgency,category,contact_name,
   funds_promised,funds_received,goal_amount,notes,source_type,source_id)
SELECT DISTINCT ON (m.user_id,m.project_id)
  m.user_id,left(p.title,240),left(p.description,5000),
  'open'::askanus_status,'medium'::askanus_urgency,'General',
  left(coalesce(p.organizer_name,''),240),0,0,0,
  'Community project joined. Use this private workspace to organize your work.',
  'community_project',m.project_id
FROM public.project_members m
JOIN public.community_projects p ON p.id=m.project_id
WHERE m.user_id>0
ORDER BY m.user_id,m.project_id,m.created_at
ON CONFLICT DO NOTHING;
COMMIT;
