
CREATE TABLE IF NOT EXISTS t_p6573413_multi_browser_login.browser_sessions (
  id SERIAL PRIMARY KEY,
  session_key TEXT NOT NULL UNIQUE,
  account_login TEXT NOT NULL,
  account_site TEXT,
  proxy TEXT,
  scenario_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS t_p6573413_multi_browser_login.browser_logs (
  id SERIAL PRIMARY KEY,
  session_key TEXT,
  level TEXT NOT NULL DEFAULT 'info',
  browser TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_browser_logs_session ON t_p6573413_multi_browser_login.browser_logs(session_key);
CREATE INDEX IF NOT EXISTS idx_browser_logs_created ON t_p6573413_multi_browser_login.browser_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_browser_sessions_status ON t_p6573413_multi_browser_login.browser_sessions(status);
