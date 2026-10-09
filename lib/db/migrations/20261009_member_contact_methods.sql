-- STAGED ONLY; must not be applied without owner approval and production DB backup.
CREATE TABLE IF NOT EXISTS member_contact_methods (
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('volunteer','help')),
  primary_method text NOT NULL CHECK (primary_method IN ('phone','email','sms')),
  primary_value text NOT NULL,
  backup_method text CHECK (backup_method IS NULL OR backup_method IN ('phone','email','sms')),
  backup_value text,
  may_consider_sharing text NOT NULL DEFAULT 'no' CHECK (may_consider_sharing IN ('yes','no')),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id,purpose),
  CHECK ((backup_method IS NULL AND backup_value IS NULL)
    OR (backup_method IS NOT NULL AND backup_value IS NOT NULL AND backup_method <> primary_method))
);
-- Access only through authenticated APIs. Do not grant public/anonymous SELECT.
