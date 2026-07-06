CREATE TABLE IF NOT EXISTS login_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logout_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_events_user ON login_events(user_id, login_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_open ON login_events(user_id) WHERE logout_at IS NULL;

CREATE TABLE IF NOT EXISTS screen_time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  module_key TEXT NOT NULL,
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, module_key, activity_date)
);
CREATE INDEX IF NOT EXISTS idx_screen_time_user_date ON screen_time_logs(user_id, activity_date);

-- Atomic increment (supabase-js .upsert() can't express col = col + x)
CREATE OR REPLACE FUNCTION increment_screen_time(
  p_user_id UUID, p_module_key TEXT, p_activity_date DATE, p_seconds INTEGER
) RETURNS VOID AS $$
BEGIN
  INSERT INTO screen_time_logs (user_id, module_key, activity_date, duration_seconds, updated_at)
  VALUES (p_user_id, p_module_key, p_activity_date, LEAST(GREATEST(p_seconds, 0), 120), NOW())
  ON CONFLICT (user_id, module_key, activity_date)
  DO UPDATE SET duration_seconds = screen_time_logs.duration_seconds + EXCLUDED.duration_seconds,
                updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
