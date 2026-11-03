-- Bounded, resumable Article Edition coordination. Prompts and owner facts are
-- never stored here; requests carry their input again during automatic polling.
CREATE TABLE article_edition_jobs (
  id TEXT PRIMARY KEY,
  ip_digest TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('preparing','generating','completed','failed')),
  lease_token TEXT,
  lease_until INTEGER,
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  evidence_digest TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX article_edition_jobs_updated ON article_edition_jobs(updated_at);

-- Immutable, source-linked perspectives. A different curiosity intent inserts
-- another row; owner facts and visual observations remain in their own tables.
CREATE TABLE article_interpretations (
  id TEXT PRIMARY KEY,
  asset_version TEXT NOT NULL REFERENCES asset_versions(id),
  image_sha256 TEXT NOT NULL,
  intent_digest TEXT NOT NULL,
  source_digest TEXT NOT NULL,
  observation_digest TEXT NOT NULL,
  profile_version TEXT NOT NULL,
  topic TEXT NOT NULL,
  focus_question TEXT NOT NULL,
  source_ids_json TEXT NOT NULL CHECK(json_valid(source_ids_json)),
  created_at INTEGER NOT NULL
);
CREATE INDEX article_interpretations_asset_intent ON article_interpretations(asset_version,intent_digest);
