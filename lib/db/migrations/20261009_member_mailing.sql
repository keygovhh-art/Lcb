-- STAGED ONLY. Requires manual migration approval before releasing this feature.
-- Private address, explicit USPS consent, administrative stop-mailing control.
CREATE TABLE IF NOT EXISTS member_mailing_preferences (
  user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL DEFAULT 'US',
  usps_consent boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  address_updated_at timestamptz NOT NULL DEFAULT NOW(),
  mailing_hold boolean NOT NULL DEFAULT false,
  admin_note text,
  CONSTRAINT usps_consent_requires_timestamp CHECK (
    (usps_consent = false AND consent_at IS NULL) OR
    (usps_consent = true AND consent_at IS NOT NULL)
  )
);
-- No address table grants to public/anonymous roles; access only through
-- authenticated application endpoints. Review DB grants separately.
