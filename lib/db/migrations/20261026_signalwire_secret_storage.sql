-- Add-only, for the replacement SignalWire hotline exclusively.
-- Sealed API token must NEVER be sent to browser after saving or placed in URLs.
-- Old Yemot credentials, recordings, extension /0 and CC /4444 untouched.
CREATE TABLE IF NOT EXISTS public.gavhah_signalwire_credentials (
  id smallint PRIMARY KEY DEFAULT 1 CHECK(id=1),
  space_hostname text NOT NULL,
  project_id text NOT NULL,
  token_nonce text NOT NULL,
  token_ciphertext text NOT NULL,
  token_tag text NOT NULL,
  verified_at timestamptz,
  last_test_at timestamptz,
  updated_by integer NOT NULL REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.gavhah_signalwire_credentials FROM PUBLIC;
COMMENT ON TABLE public.gavhah_signalwire_credentials IS
  'Replacement SignalWire API credential bundle. AES-256-GCM; never used to alter legacy Yemot line.';