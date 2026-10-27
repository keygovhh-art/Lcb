-- Purely additive read-only audit of the owner's existing SignalWire number.
-- DO NOT alter the live number or its voice routing, SMS, Fabric or provider call flows.
CREATE TABLE IF NOT EXISTS public.gavhah_signalwire_shared_route (
  id smallint PRIMARY KEY DEFAULT 1 CHECK(id=1),
  requested_number text NOT NULL DEFAULT '6056558080',
  old_extension text NOT NULL DEFAULT '55555',
  audit_state text NOT NULL DEFAULT 'queued' CHECK(audit_state IN
    ('queued','inspecting','verified_compatibility_voice_url','unresolved','not_found','failed')),
  provider_number_sid text,
  original_voice_url text,
  original_voice_method text,
  original_voice_application_sid text,
  original_voice_fallback_url text,
  original_voice_fallback_method text,
  original_trunk_sid text,
  original_sms_url text,
  original_provider_api text,
  original_call_handler text,
  original_route_details jsonb,
  route_fingerprint text,
  checked_at timestamptz,
  last_error text,
  -- Invariant: do not allow a provider rewrite without a second explicit
  -- operator-approved switch step and a verified reversible old route.
  cutover_enabled boolean NOT NULL DEFAULT false CHECK(cutover_enabled=false),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.gavhah_signalwire_shared_route FROM PUBLIC;
COMMENT ON TABLE public.gavhah_signalwire_shared_route IS
 'Read-only snapshot of original 8080655605 route, protected until 55555 path is verified. Never automatically change provider voice settings.';