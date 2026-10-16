-- Internal hotline mailbox: one persistent record per recipient, no call or SMS sent.
CREATE TABLE IF NOT EXISTS hotline_mailbox_entries (
 id bigserial PRIMARY KEY,
 broadcast_id integer NOT NULL REFERENCES broadcasts(id) ON DELETE RESTRICT,
 user_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 subject text NOT NULL,
 message text NOT NULL,
 is_read boolean NOT NULL DEFAULT false,
 listened_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(broadcast_id,user_id)
);
CREATE INDEX IF NOT EXISTS hotline_mailbox_recipient_idx
 ON hotline_mailbox_entries(user_id,is_read,created_at DESC);
