-- Durable per-stage checkpoints for 3-story generation resume. Each row
-- stores one validated, completed stage result; a later request for the
-- same job adopts it instead of re-running inference. Values are bound
-- to the job, input, evidence snapshot and workflow version, and are
-- re-validated against a fresh pool on load: a stale checkpoint is
-- discarded and its stage re-runs, never published as-is.
CREATE TABLE article_edition_checkpoints (
  job_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK(stage IN ('chief','review','revision','confirmation')),
  checkpoint_json TEXT NOT NULL CHECK(json_valid(checkpoint_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (job_id, stage)
);
CREATE INDEX article_edition_checkpoints_job ON article_edition_checkpoints(job_id);
