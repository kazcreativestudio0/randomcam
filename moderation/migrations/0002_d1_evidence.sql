-- Upgrade an existing *empty* moderation database from the former R2-backed schema.
-- Upload intents last only five minutes. The old reports table is also empty by assumption.
-- Do not run this migration where moderation reports already exist.
DROP TABLE reports;
DROP TABLE upload_intents;

CREATE TABLE reports (
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
CREATE INDEX reports_expiry ON reports(expires_at);
CREATE INDEX reports_subject ON reports(reported_session_key, created_at);

CREATE TABLE upload_intents (
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
