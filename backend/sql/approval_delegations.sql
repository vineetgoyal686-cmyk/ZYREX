CREATE TABLE IF NOT EXISTS approval_delegations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delegate_id   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actions       text[]      NOT NULL DEFAULT '{}',   -- ["issue","recall","cancel","amend","approval"]
  start_date    date        NOT NULL,
  end_date      date        NOT NULL,
  reason        text,
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (delegator_id <> delegate_id)
);

CREATE INDEX IF NOT EXISTS idx_delegations_delegator ON approval_delegations(delegator_id);
CREATE INDEX IF NOT EXISTS idx_delegations_delegate  ON approval_delegations(delegate_id);
