-- Olam MAX verified financial synchronization, add-only.
-- Each MAX call may contribute at most one audited financial report.
-- Apply after backing up production and testing on isolated Neon branch.
CREATE TABLE IF NOT EXISTS public.max_call_financial_links (
  session_id bigint PRIMARY KEY REFERENCES public.max_call_sessions(id) ON DELETE RESTRICT,
  report_id integer NOT NULL UNIQUE REFERENCES public.fundraising_call_reports(id) ON DELETE RESTRICT,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  case_id integer NOT NULL REFERENCES public.askanus_cases(id) ON DELETE RESTRICT,
  money_kind text NOT NULL CHECK(money_kind IN ('received','pledged')),
  amount numeric(16,2) NOT NULL CHECK(amount>=0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS max_call_financial_links_owner_idx
 ON public.max_call_financial_links(user_id,case_id,updated_at DESC);
