-- Additive only. Existing 0001 and its grants/audit remain authoritative.
CREATE TABLE source_observations (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, source_id TEXT NOT NULL REFERENCES brand_sources(id),
  page_url TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('observed','fetched','blocked','failed','js_required')),
  transport TEXT NOT NULL, http_status INTEGER, content_sha256 TEXT, discovered_count INTEGER NOT NULL,
  observed_at TEXT NOT NULL
);
CREATE TABLE discovered_images (
  image_url TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES brand_sources(id),
  candidate_json TEXT NOT NULL CHECK(json_valid(candidate_json)), discovered_at TEXT NOT NULL
);
CREATE TABLE publisher_metadata (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, version_id TEXT NOT NULL REFERENCES asset_versions(id),
  source_id TEXT NOT NULL REFERENCES brand_sources(id), publisher_name TEXT NOT NULL,
  campaign_title TEXT, description TEXT, publisher_alt TEXT,
  hints_json TEXT NOT NULL CHECK(json_valid(hints_json)), source_page TEXT NOT NULL,
  observed_at TEXT NOT NULL, UNIQUE(version_id,source_id)
);
CREATE TABLE asset_access_checks (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, version_id TEXT NOT NULL REFERENCES asset_versions(id),
  status TEXT NOT NULL CHECK(status IN ('unverified','observed','reachable','blocked','failed')),
  transport TEXT NOT NULL, http_status INTEGER, content_type TEXT, checked_at TEXT NOT NULL
);
CREATE TABLE source_identity_reviews (
  source_id TEXT PRIMARY KEY REFERENCES brand_sources(id), canonical_brand_id TEXT NOT NULL,
  brand_name TEXT NOT NULL, evidence TEXT NOT NULL, reviewer TEXT NOT NULL, reviewed_at TEXT NOT NULL
);
CREATE TABLE reader_asset_reviews (
  version_id TEXT PRIMARY KEY REFERENCES asset_versions(id), source_id TEXT NOT NULL REFERENCES brand_sources(id),
  alt TEXT NOT NULL, attribution TEXT NOT NULL, source_page TEXT NOT NULL,
  licensing_evidence TEXT NOT NULL, reviewer TEXT NOT NULL, reviewed_at TEXT NOT NULL
);
CREATE TABLE asset_analysis_jobs (
  cache_key TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES asset_versions(id), image_sha256 TEXT,
  model TEXT NOT NULL CHECK(model='muse-spark-1.3'), spec TEXT NOT NULL,
  origin TEXT NOT NULL CHECK(origin IN ('mock','meta')),
  permission_revision INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('processing','succeeded','failed')),
  claim_token TEXT NOT NULL, lease_until INTEGER NOT NULL,
  intelligence_id TEXT REFERENCES asset_intelligence(id), error_code TEXT, updated_at TEXT NOT NULL
);
CREATE INDEX publisher_version ON publisher_metadata(version_id,source_id);
CREATE INDEX access_version ON asset_access_checks(version_id,sequence);
CREATE INDEX jobs_version ON asset_analysis_jobs(version_id,origin,state,updated_at);
CREATE INDEX observations_source ON source_observations(source_id,sequence);
