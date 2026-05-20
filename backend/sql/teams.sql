-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id       TEXT UNIQUE,
  name          TEXT NOT NULL,
  department_id UUID,
  leader_id     UUID,
  member_ids    UUID[] DEFAULT '{}',
  status        TEXT DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-generate team_id sequence helper (optional index)
CREATE INDEX IF NOT EXISTS idx_teams_department ON teams(department_id);
CREATE INDEX IF NOT EXISTS idx_teams_leader     ON teams(leader_id);
