-- One platform-wide Yemot connection, owned by the Gavhah super administrator.
-- No organization_id: organizations cannot provision or read separate API keys.
CREATE TABLE IF NOT EXISTS public.gavhah_yemot_global (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  token_nonce text NOT NULL,
  token_ciphertext text NOT NULL,
  token_tag text NOT NULL,
  line_number text NOT NULL CHECK (line_number ~ '^[0-9]{7,15}$'),
  enabled boolean NOT NULL DEFAULT false,
  last_verified_at timestamptz,
  last_test_at timestamptz,
  updated_by integer NOT NULL REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.gavhah_yemot_global FROM PUBLIC;
COMMENT ON TABLE public.gavhah_yemot_global IS 'Single AES-256-GCM sealed global Yemot provider configuration; owner-only via Gavhah backend.';
