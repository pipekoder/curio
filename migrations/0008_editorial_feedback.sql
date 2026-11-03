-- Owner-only feedback. Article jobs may expire; feedback remains attached to
-- the immutable article ID and content-derived generation version.
CREATE TABLE editorial_article_feedback (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  generation_version TEXT NOT NULL,
  job_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approve','revise','reject')),
  categories_json TEXT NOT NULL CHECK(json_valid(categories_json)),
  feedback_text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX editorial_article_feedback_article_created ON editorial_article_feedback(article_id,created_at DESC);

CREATE TABLE editorial_principles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  guidance TEXT NOT NULL,
  content_digest TEXT NOT NULL UNIQUE,
  approved INTEGER NOT NULL DEFAULT 0 CHECK(approved IN (0,1)),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1) AND enabled<=approved),
  source_feedback_id TEXT REFERENCES editorial_article_feedback(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX editorial_principles_active ON editorial_principles(approved,enabled,id);

INSERT INTO editorial_principles(id,title,guidance,content_digest,approved,enabled,source_feedback_id,created_at,updated_at)
VALUES(
  'EF-001',
  'Editorial coherence must be discovered, not imposed.',
  'Avoid forcing unrelated brands into abstract themes. Prefer authentic design connections, meaningful contrasts, or independent narratives. Avoid excessive metaphors, decorative philosophy, anthropomorphism, and unsupported interpretation. Prioritize distinctive brand information and genuine reader curiosity.',
  '348b52c88810d9dea9d680284e9e03682e55937f5e4076bc4839eff32036cbc1',1,1,NULL,0,0
);
