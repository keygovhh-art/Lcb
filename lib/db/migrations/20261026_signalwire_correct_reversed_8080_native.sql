-- Correct mistakenly reversed digits following owner's SignalWire console screenshot.
-- Actual existing phone number: +1 (605) 655-8080 = +16056558080.
-- Older typed 8080655605 was the digits in reverse order.
-- Never change provider routing, permissions, recordings or webhook.
ALTER TABLE public.gavhah_signalwire_shared_route
 ADD COLUMN IF NOT EXISTS original_provider_api text;
ALTER TABLE public.gavhah_signalwire_shared_route
 ADD COLUMN IF NOT EXISTS original_call_handler text;
ALTER TABLE public.gavhah_signalwire_shared_route
 ADD COLUMN IF NOT EXISTS original_route_details jsonb;
UPDATE public.gavhah_signalwire_shared_route
 SET requested_number='6056558080',audit_state='queued',
     provider_number_sid=NULL,original_voice_url=NULL,original_voice_method=NULL,
     original_voice_application_sid=NULL,original_voice_fallback_url=NULL,
     original_voice_fallback_method=NULL,original_trunk_sid=NULL,original_sms_url=NULL,
     original_provider_api=NULL,original_call_handler=NULL,original_route_details=NULL,
     route_fingerprint=NULL,checked_at=NULL,last_error=NULL,updated_at=now()
 WHERE id=1 AND requested_number='8080655605' AND cutover_enabled=false;
