-- Durable Automatic Product Hotspot jobs. One row per exact image
-- version, fingerprint, target product and localization prompt: a
-- changed fingerprint, product or prompt is a different job, which
-- segregates stale cache entries without deletes. Terminal states
-- (ready, no-match, failed) are never re-run automatically.
CREATE TABLE sam_hotspot_jobs (
  id TEXT PRIMARY KEY,
  version_id TEXT NOT NULL,
  image_sha256 TEXT NOT NULL,
  product_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','processing','ready','no-match','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX sam_hotspot_jobs_version ON sam_hotspot_jobs(version_id,state);
