CREATE TABLE IF NOT EXISTS approval_flows (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text        NOT NULL,
  module             text        NOT NULL, -- 'order', 'intake', 'payment'
  status             text        NOT NULL DEFAULT 'active',
  priority           int         NOT NULL DEFAULT 1,
  self_approve_below numeric,
  escalation_days    int         DEFAULT 1,
  description        text,
  conditions_match   text        DEFAULT 'all', -- 'all' or 'any'
  conditions         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  config_options     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  levels             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id       uuid        REFERENCES approval_flows(id),
  module        text        NOT NULL,
  document_id   text        NOT NULL,
  status        text        NOT NULL DEFAULT 'pending', -- pending, approved, rejected, reverted, withdrawn
  current_level int         NOT NULL DEFAULT 1,
  flow_snapshot jsonb,
  requested_by  uuid        NOT NULL,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_document ON approval_requests(document_id, status);

CREATE TABLE IF NOT EXISTS approval_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       uuid        NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  level_number     int         NOT NULL,
  designation_name text,
  action           text        NOT NULL, -- approved, rejected, reverted, withdrawn
  action_by        uuid        NOT NULL,
  action_by_name   text,
  comments         text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
