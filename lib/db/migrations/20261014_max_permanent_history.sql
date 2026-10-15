-- Historical events survive normal completion, settlement and project closure.
-- No FK to source records: even explicitly deleted work has an audit snapshot.
CREATE TABLE IF NOT EXISTS max_history_events (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  case_id integer,
  entity_type text NOT NULL,
  entity_id integer NOT NULL,
  action text NOT NULL,
  title text NOT NULL,
  details text NOT NULL DEFAULT '',
  happened_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS max_history_events_owner_time_idx ON max_history_events(user_id,happened_at);
CREATE INDEX IF NOT EXISTS max_history_events_owner_case_idx ON max_history_events(user_id,case_id);
CREATE INDEX IF NOT EXISTS max_history_events_owner_entity_idx ON max_history_events(user_id,entity_type,entity_id);
