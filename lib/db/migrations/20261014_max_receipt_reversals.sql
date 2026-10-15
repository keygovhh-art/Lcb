-- Independent staged MAX receipt adjustments. Financially non-destructive.
ALTER TABLE max_receipts ADD COLUMN IF NOT EXISTS refunded_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE max_receipts DROP CONSTRAINT IF EXISTS max_receipts_refunded_amount_check;
ALTER TABLE max_receipts ADD CONSTRAINT max_receipts_refunded_amount_check
 CHECK(refunded_amount >= 0 AND refunded_amount <= amount);
CREATE TABLE IF NOT EXISTS max_receipt_refunds(
 id serial PRIMARY KEY,
 user_id integer NOT NULL,
 receipt_id integer NOT NULL REFERENCES max_receipts(id) ON DELETE RESTRICT,
 case_id integer NOT NULL REFERENCES askanus_cases(id) ON DELETE RESTRICT,
 amount numeric(12,2) NOT NULL CHECK(amount > 0),
 reason text NOT NULL,
 request_id text NOT NULL,
 created_at timestamp NOT NULL DEFAULT now(),
 CONSTRAINT max_receipt_refunds_owner_request_unique UNIQUE(user_id,request_id)
);
CREATE INDEX IF NOT EXISTS max_receipt_refunds_receipt_idx ON max_receipt_refunds(receipt_id);
