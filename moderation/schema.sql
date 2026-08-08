-- Apply with: wrangler d1 execute randomcam-moderation --file=moderation/schema.sql
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reported_session_key TEXT NOT NULL,
  reporter_session_key TEXT NOT NULL,
  match_id TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK(reason_code IN ('sexual','nudity','harassment','solicitation','minor_concern','other')),
  note TEXT NOT NULL DEFAULT '',
  evidence_blob BLOB,
  evidence_content_type TEXT,
  evidence_size INTEGER,
  evidence_sha256 TEXT,
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','upheld','dismissed','expired')),
  reviewed_at TEXT,
  review_note TEXT,
  UNIQUE(reported_session_key, reporter_session_key, match_id)
);
CREATE INDEX IF NOT EXISTS reports_expiry ON reports(expires_at);
CREATE INDEX IF NOT EXISTS reports_subject ON reports(reported_session_key, created_at);
CREATE TABLE IF NOT EXISTS suspensions (
  id TEXT PRIMARY KEY,
  subject_key TEXT NOT NULL,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('session','install')),
  status TEXT NOT NULL CHECK(status IN ('active','lifted','expired')),
  source TEXT NOT NULL CHECK(source IN ('auto_two_reports','admin')),
  reason TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  lifted_at TEXT,
  lifted_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS active_suspension ON suspensions(subject_key, subject_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS suspension_lookup ON suspensions(subject_key, status, ends_at);
CREATE TABLE IF NOT EXISTS upload_intents (
  id TEXT PRIMARY KEY,
  reporter_session_key TEXT NOT NULL,
  reported_session_key TEXT NOT NULL,
  match_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  uploaded_at TEXT,
  sha256 TEXT,
  evidence_blob BLOB,
  evidence_content_type TEXT,
  evidence_size INTEGER
);
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  report_id TEXT,
  created_at TEXT NOT NULL,
  ip_hash TEXT
);
