-- Owner revision records. Article text is immutable; owner decisions are separate.
CREATE TABLE editorial_article_versions (
  version_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  parent_version_id TEXT,
  feedback_id TEXT REFERENCES editorial_article_feedback(id),
  article_json TEXT NOT NULL CHECK(json_valid(article_json)),
  review_status TEXT NOT NULL CHECK(review_status IN ('original','confirmed')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(job_id,article_id,version_id)
);
CREATE INDEX editorial_article_versions_history ON editorial_article_versions(job_id,article_id,created_at);
CREATE TABLE editorial_article_revision_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  parent_version_id TEXT NOT NULL,
  feedback_id TEXT NOT NULL REFERENCES editorial_article_feedback(id),
  state TEXT NOT NULL CHECK(state IN ('running','completed','failed')),
  result_version_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(job_id,article_id,parent_version_id,feedback_id)
);
CREATE INDEX editorial_article_revision_attempts_scope ON editorial_article_revision_attempts(job_id,article_id,state);
CREATE TABLE editorial_article_decisions (
  job_id TEXT NOT NULL,
  article_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approve','reject')),
  decided_at INTEGER NOT NULL,
  PRIMARY KEY(job_id,article_id,version_id)
);
CREATE INDEX editorial_article_decisions_scope ON editorial_article_decisions(job_id,article_id,decision);
CREATE UNIQUE INDEX editorial_article_revision_one_running ON editorial_article_revision_attempts(job_id,article_id) WHERE state='running';
