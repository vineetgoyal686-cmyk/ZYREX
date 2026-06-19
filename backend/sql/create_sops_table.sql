-- Standard Operating Procedures table
CREATE TABLE IF NOT EXISTS sops (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  steps           JSONB NOT NULL DEFAULT '[]',
  created_by      UUID,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- steps column stores an ordered array of step objects:
-- [{ "id": "uuid", "title": "Step title", "description": "Optional detail" }, ...]
