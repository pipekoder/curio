-- Local/operator migration only. No grants are inherited between versions.
CREATE TABLE discovery_runs (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES brand_sources(id), scope_url TEXT NOT NULL,
  observed_at TEXT NOT NULL, status TEXT NOT NULL, manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json))
);
CREATE TABLE content_nodes (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES brand_sources(id), original_url TEXT NOT NULL,
  kind TEXT NOT NULL, latest_version TEXT, availability TEXT NOT NULL DEFAULT 'active', UNIQUE(source_id,original_url,kind)
);
CREATE TABLE content_versions (
  id TEXT PRIMARY KEY, node_id TEXT NOT NULL REFERENCES content_nodes(id), fingerprint TEXT NOT NULL,
  content_json TEXT NOT NULL CHECK(json_valid(content_json)), created_at TEXT NOT NULL
);
CREATE TABLE content_sightings (
  run_id TEXT NOT NULL REFERENCES discovery_runs(id), node_id TEXT NOT NULL REFERENCES content_nodes(id),
  version_id TEXT NOT NULL REFERENCES content_versions(id), state TEXT NOT NULL CHECK(state IN ('added','updated','unchanged','removed','inaccessible')),
  PRIMARY KEY(run_id,node_id)
);
CREATE TABLE content_edges (
  run_id TEXT NOT NULL REFERENCES discovery_runs(id), from_id TEXT NOT NULL REFERENCES content_nodes(id),
  to_id TEXT NOT NULL REFERENCES content_nodes(id), relation TEXT NOT NULL,
  PRIMARY KEY(run_id,from_id,to_id,relation)
);
CREATE TABLE content_reviews (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT, version_id TEXT NOT NULL REFERENCES content_versions(id), purpose TEXT NOT NULL CHECK(purpose IN ('display','ai_analysis','edits')),
  status TEXT NOT NULL DEFAULT 'pending', evidence TEXT, reviewer TEXT NOT NULL, reviewed_at TEXT NOT NULL,
  CHECK(status IN ('pending','approved','rejected','blocked')),
  CHECK(status<>'approved' OR evidence IS NOT NULL)
);
CREATE TABLE content_catalog_links (
  content_version TEXT PRIMARY KEY REFERENCES content_versions(id), asset_version TEXT NOT NULL REFERENCES asset_versions(id)
);
CREATE TABLE catalog_publications (
  version_id TEXT PRIMARY KEY REFERENCES asset_versions(id), catalog_json TEXT NOT NULL CHECK(json_valid(catalog_json)),
  reviewer TEXT NOT NULL, reviewed_at TEXT NOT NULL
);
CREATE INDEX content_source ON content_nodes(source_id,original_url);
CREATE INDEX sightings_node ON content_sightings(node_id,run_id);
CREATE INDEX versions_node ON content_versions(node_id,created_at);
CREATE INDEX catalog_links_asset ON content_catalog_links(asset_version);
