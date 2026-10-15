-- Additive private contact enrichment; preserves all existing contact values.
ALTER TABLE communication_contacts ADD COLUMN IF NOT EXISTS organization text NOT NULL DEFAULT '';
ALTER TABLE communication_contacts ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '';
ALTER TABLE communication_contacts ADD COLUMN IF NOT EXISTS tags text NOT NULL DEFAULT '';
