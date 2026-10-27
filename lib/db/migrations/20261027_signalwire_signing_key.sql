-- Additive, encrypted, project-scoped SignalWire webhook-signing key storage.
-- Existing API token, provider number, original webhook, Yemot and 4444 unchanged.
CREATE TABLE IF NOT EXISTS public.gavhah_signalwire_signing_keys (
  id smallint PRIMARY KEY DEFAULT 1 CHECK(id=1),
  project_id text NOT NULL,
  key_nonce text NOT NULL,
  key_ciphertext text NOT NULL,
  key_tag text NOT NULL,
  updated_by integer NOT NULL REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.gavhah_signalwire_signing_keys FROM PUBLIC;
COMMENT ON TABLE public.gavhah_signalwire_signing_keys IS
'Encrypted project-bound SignalWire webhook signing key for Gavhah. Never sent back to browser; not an API token.';
