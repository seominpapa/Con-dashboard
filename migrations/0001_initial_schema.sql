-- ============================================================
-- 건설 Dashboard 초기 스키마
-- 기획 31~54번: 사용자 인증/승인, 관리자 API연결센터, AI Briefing
-- ============================================================

-- 사용자 (Google OAuth 기반)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  profile_image TEXT,
  google_id TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER',        -- ADMIN | USER
  status TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING | APPROVED | REJECTED | SUSPENDED
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  approved_by TEXT,
  last_login_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- 세션 (경량 서버측 세션 저장 - httpOnly 쿠키에는 세션ID만 보관)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

-- 관리자 중앙 API/AI Provider 연결 정보 (기획 33~34, 52)
-- 자격증명은 반드시 암호화(encrypted_credential)하여 저장한다. 평문 저장 금지.
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  provider TEXT UNIQUE NOT NULL,     -- kma, airkorea, g2b, law, ecos, opinet, naver_maps, its, claude, codex
  type TEXT NOT NULL,                -- public_api | ai_provider
  status TEXT NOT NULL DEFAULT 'DISCONNECTED', -- CONNECTED | DISCONNECTED | ERROR | EXPIRED | CHECKING
  encrypted_credential TEXT,         -- AES-GCM 암호화된 JSON (base64)
  metadata TEXT,                     -- JSON (예: 계정명, 모델 목록 등 민감정보 아닌 것만)
  connected_at TEXT,
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 서비스 전역 설정 (기본 LLM Provider 등 key-value)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AI Briefing (기획 42번) - userId + briefingDate unique
CREATE TABLE IF NOT EXISTS ai_briefings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id TEXT,
  briefing_date TEXT NOT NULL,   -- YYYY-MM-DD (Asia/Seoul 기준)
  provider TEXT NOT NULL,        -- claude | codex
  model TEXT,
  content TEXT,                  -- 사람이 읽는 렌더용 텍스트(선택)
  structured_content TEXT NOT NULL, -- JSON (기획 44번 구조)
  context_hash TEXT,
  status TEXT NOT NULL DEFAULT 'success', -- success | error
  error_message TEXT,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, briefing_date)
);
CREATE INDEX IF NOT EXISTS idx_briefings_user_date ON ai_briefings(user_id, briefing_date);

-- AI 사용량 로그 (기획 50번 - 향후 비용/사용량 집계용)
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  provider TEXT NOT NULL,
  model TEXT,
  purpose TEXT NOT NULL DEFAULT 'briefing', -- briefing | chat
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  estimated_cost_usd REAL DEFAULT 0,
  success INTEGER NOT NULL DEFAULT 1,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_usage_logs_date ON ai_usage_logs(created_at);

-- 사용자별 Dashboard 저장 (기획 2번: localStorage -> DB 전환 대비 Repository 구조)
-- MVP는 localStorage 사용하지만, 로그인 사용자는 D1에도 동기화 가능하도록 스키마 준비
CREATE TABLE IF NOT EXISTS dashboard_configs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  config_json TEXT NOT NULL, -- DashboardConfig 전체 JSON (desktop/mobile layout, sites, settings 등)
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id)
);

-- 사용자 일정 (로그인 사용자 기준 서버 저장, Google Calendar 동기화 대비)
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  location TEXT,
  attendees TEXT,     -- JSON array
  site_id TEXT,
  category TEXT NOT NULL DEFAULT 'etc',
  importance TEXT NOT NULL DEFAULT 'normal',
  external_id TEXT,
  external_provider TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules(user_id, start_at);

-- 사용자 할일
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'todo',
  project TEXT,
  site_id TEXT,
  assignee TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id, status);

-- 사용자 현장(Site)
CREATE TABLE IF NOT EXISTS sites (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT,
  address TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  kma_nx INTEGER NOT NULL,
  kma_ny INTEGER NOT NULL,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  airkorea_station_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id);

-- 관심 입찰 필터, 관심 뉴스/법령/환율/유가/자재 (기획 26번 관심정보 설정)
CREATE TABLE IF NOT EXISTS user_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pref_type TEXT NOT NULL,   -- bid_filter | news_category | law | exchange | oil | material
  value_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prefs_user_type ON user_preferences(user_id, pref_type);
