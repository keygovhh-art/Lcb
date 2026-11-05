-- Gavhah main keypad 3, private community / Askanim assistance + staff-only review.
-- Additive. Existing project rows and private help records remain untouched.
CREATE TABLE IF NOT EXISTS public.gavhah_phone3_intake (
 id BIGSERIAL PRIMARY KEY,
 member_id INTEGER NOT NULL REFERENCES public.users(id),
 kind TEXT NOT NULL CHECK(kind IN ('offer','request','project')),
 category TEXT NOT NULL,
 availability TEXT,
 urgency TEXT,
 voice_title TEXT,
 voice_details TEXT NOT NULL,
 voice_location TEXT,
 voice_goal TEXT,
 project_id INTEGER REFERENCES public.community_projects(id) ON DELETE SET NULL,
 source TEXT NOT NULL DEFAULT 'yemot' CHECK(source IN ('yemot','web')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewing','completed','rejected')),
 request_fingerprint CHAR(64) NOT NULL UNIQUE,
 reviewed_by INTEGER REFERENCES public.users(id),
 reviewed_at TIMESTAMPTZ,
 staff_notes TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT gavhah_phone3_recording_format_chk CHECK (
  (voice_title IS NULL OR (voice_title LIKE 'ivr2:/%' AND RIGHT(voice_title,4)='.wav'))
  AND voice_details LIKE 'ivr2:/%' AND RIGHT(voice_details,4)='.wav'
  AND (voice_location IS NULL OR (voice_location LIKE 'ivr2:/%' AND RIGHT(voice_location,4)='.wav'))
  AND (voice_goal IS NULL OR (voice_goal LIKE 'ivr2:/%' AND RIGHT(voice_goal,4)='.wav'))
 )
);
CREATE INDEX IF NOT EXISTS gavhah_phone3_intake_queue_idx
 ON public.gavhah_phone3_intake(status,created_at DESC);
CREATE INDEX IF NOT EXISTS gavhah_phone3_intake_member_idx
 ON public.gavhah_phone3_intake(member_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.gavhah_project_review_log (
 id BIGSERIAL PRIMARY KEY,
 project_id INTEGER NOT NULL REFERENCES public.community_projects(id) ON DELETE CASCADE,
 reviewer_id INTEGER NOT NULL REFERENCES public.users(id),
 decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')),
 note TEXT NOT NULL DEFAULT '',
 reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gavhah_project_review_log_project_idx
 ON public.gavhah_project_review_log(project_id,reviewed_at DESC);
