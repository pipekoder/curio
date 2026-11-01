-- Reviewed object localization is separate from model output and product identity.
CREATE TABLE sam_object_reviews (
  capture_id TEXT NOT NULL REFERENCES object_regions(id),
  region_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','blocked')) DEFAULT 'pending',
  editorial_detail TEXT,
  product_id TEXT REFERENCES media_products(id),
  identity_evidence TEXT,
  reviewer TEXT,
  reviewed_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(capture_id,region_id),
  CHECK(status != 'approved' OR (editorial_detail IS NOT NULL AND reviewer IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK(product_id IS NULL OR identity_evidence IS NOT NULL)
);
CREATE INDEX sam_object_reviews_status ON sam_object_reviews(status,capture_id);
