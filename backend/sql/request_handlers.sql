CREATE TABLE IF NOT EXISTS request_handlers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key  text        NOT NULL,
  action_key  text        NOT NULL,
  users       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_single   boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_key, action_key)
);
