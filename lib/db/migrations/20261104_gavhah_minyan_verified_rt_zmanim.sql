CREATE TABLE IF NOT EXISTS public.gavhah_minyan_verified_zmanim (
 minyan_id INTEGER NOT NULL REFERENCES public.minyans(id) ON DELETE CASCADE,
 local_day DATE NOT NULL,
 rabeinu_tam_at TIMESTAMPTZ NOT NULL,
 verified_source TEXT NOT NULL,
 verified_by INTEGER REFERENCES public.users(id),
 verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(minyan_id,local_day)
);
-- Only staff-verified zmanim permit relative R"T schedule times in directions.
