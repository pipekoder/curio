-- Forward-only metadata migration. No image blobs, credentials or reader data.
PRAGMA foreign_keys = ON;
CREATE TABLE brand_sources (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, entry_url TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('gallery','individual_urls')),
  issue_url TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE catalog_assets (
  id TEXT PRIMARY KEY, image_url TEXT NOT NULL UNIQUE,
  archived_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE asset_versions (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, asset_id TEXT NOT NULL REFERENCES catalog_assets(id),
  version_key TEXT NOT NULL, manifest_hash TEXT NOT NULL,
  sha256 TEXT, width INTEGER, height INTEGER, alt TEXT, attribution TEXT,
  source_type TEXT NOT NULL CHECK(source_type IN ('brand_candidate','synthetic_concept','editorial_support')),
  provenance_json TEXT NOT NULL CHECK(json_valid(provenance_json)),
  created_at TEXT NOT NULL, UNIQUE(asset_id, version_key),
  CHECK ((width IS NULL AND height IS NULL) OR (width > 0 AND height > 0))
);
CREATE TABLE asset_discoveries (
  version_id TEXT NOT NULL REFERENCES asset_versions(id),
  source_id TEXT NOT NULL REFERENCES brand_sources(id),
  source_page TEXT, retrieved_at TEXT NOT NULL,
  PRIMARY KEY(version_id, source_id)
);
CREATE TABLE asset_permissions (
  version_id TEXT NOT NULL REFERENCES asset_versions(id),
  purpose TEXT NOT NULL CHECK(purpose IN ('display','ai_analysis','edits')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','blocked')),
  evidence TEXT, rights_holder TEXT, reviewer TEXT, reviewed_at TEXT, revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(version_id,purpose),
  CHECK(status != 'approved' OR (evidence IS NOT NULL AND rights_holder IS NOT NULL AND reviewer IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE TABLE permission_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, version_id TEXT NOT NULL, purpose TEXT NOT NULL,
  status TEXT NOT NULL, evidence TEXT, rights_holder TEXT, reviewer TEXT, reviewed_at TEXT, revision INTEGER NOT NULL
);
CREATE TRIGGER permission_audit AFTER UPDATE ON asset_permissions BEGIN
  INSERT INTO permission_history(version_id,purpose,status,evidence,rights_holder,reviewer,reviewed_at,revision)
  VALUES(NEW.version_id,NEW.purpose,NEW.status,NEW.evidence,NEW.rights_holder,NEW.reviewer,NEW.reviewed_at,NEW.revision);
END;
CREATE TABLE asset_intelligence (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, version_id TEXT NOT NULL REFERENCES asset_versions(id),
  model TEXT NOT NULL CHECK(model = 'muse-spark-1.3'),
  origin TEXT NOT NULL CHECK(origin IN ('mock','meta')),
  output_json TEXT NOT NULL CHECK(json_valid(output_json)), created_at TEXT NOT NULL
);
CREATE TABLE editorial_facts (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES brand_sources(id),
  version_id TEXT REFERENCES asset_versions(id), statement TEXT NOT NULL,
  citation_url TEXT NOT NULL, publisher TEXT NOT NULL, retrieved_at TEXT NOT NULL,
  verified_by TEXT NOT NULL, verified_at TEXT NOT NULL
);
CREATE TABLE object_regions (
  id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES asset_versions(id),
  origin TEXT NOT NULL CHECK(origin IN ('authored_demo','sam_detection')),
  model TEXT CHECK(model = 'sam-3.1'), width INTEGER NOT NULL, height INTEGER NOT NULL,
  output_json TEXT NOT NULL CHECK(json_valid(output_json)), created_at TEXT NOT NULL,
  CHECK((origin='authored_demo' AND model IS NULL) OR (origin='sam_detection' AND model='sam-3.1'))
);
CREATE TABLE catalog_imports (
  id TEXT PRIMARY KEY, operator TEXT NOT NULL, candidate_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX versions_asset ON asset_versions(asset_id,sequence);
CREATE INDEX discoveries_source ON asset_discoveries(source_id,version_id);
CREATE INDEX permissions_status ON asset_permissions(purpose,status,version_id);
CREATE INDEX intelligence_version ON asset_intelligence(version_id,origin,sequence);
CREATE INDEX facts_source ON editorial_facts(source_id,version_id);
CREATE INDEX regions_version ON object_regions(version_id);
