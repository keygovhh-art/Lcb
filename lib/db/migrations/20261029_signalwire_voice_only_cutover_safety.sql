-- 2026-10-29: Enable only an explicitly snapshotted Calling-only migration.
-- This changes no SignalWire provider resources or telephone routing and
-- retains an enforced fail-closed CHECK for any unverified cutover attempt.
-- Apply once via a transactional DO block (no unprotected migration window).
DO $migration$
BEGIN
  IF EXISTS(
    SELECT 1 FROM public.gavhah_signalwire_shared_route
    WHERE id=1 AND cutover_enabled IS DISTINCT FROM false
  ) THEN
    RAISE EXCEPTION 'SignalWire route state changed; refuse migration';
  END IF;

  ALTER TABLE public.gavhah_signalwire_shared_route
    DROP CONSTRAINT IF EXISTS gavhah_signalwire_shared_route_cutover_enabled_check;

  ALTER TABLE public.gavhah_signalwire_shared_route
    ADD CONSTRAINT gavhah_signalwire_shared_route_cutover_enabled_check
    CHECK (
      cutover_enabled IS FALSE OR COALESCE(
        requested_number='6056558080' AND
        old_extension='55555' AND
        audit_state='verified_compatibility_voice_url' AND
        original_voice_url LIKE 'https://emes-newsroom.vercel.app/%' AND
        original_call_handler='laml_webhooks' AND
        route_fingerprint ~ '^[a-f0-9]{64}$' AND
        (original_route_details ? 'voice_only_cutover_snapshot'),
        false
      )
    );
END
$migration$;
