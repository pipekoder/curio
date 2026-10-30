-- Owner-created mockup media. R2 stores bytes; D1 remains the metadata source of truth.
PRAGMA foreign_keys = ON;

CREATE TABLE media_import_batches (
  id TEXT PRIMARY KEY,
  source_text TEXT NOT NULL DEFAULT '',
  source_json TEXT CHECK(source_json IS NULL OR json_valid(source_json)),
  status TEXT NOT NULL CHECK(status IN ('draft','uploading','ready','partial','failed')),
  results_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(results_json)),
  errors_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(errors_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE media_brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  story TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  website TEXT,
  country TEXT,
  mockup INTEGER NOT NULL DEFAULT 1 CHECK(mockup = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE media_products (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES media_brands(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK(category IN ('home','fashion','travel')),
  materials_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(materials_json)),
  price_minor INTEGER CHECK(price_minor IS NULL OR price_minor >= 0),
  currency TEXT CHECK(currency IS NULL OR currency GLOB '[A-Z][A-Z][A-Z]'),
  mockup INTEGER NOT NULL DEFAULT 1 CHECK(mockup = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(brand_id,name)
);

CREATE TABLE media_campaigns (
  id TEXT PRIMARY KEY,
  brand_id TEXT REFERENCES media_brands(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mockup INTEGER NOT NULL DEFAULT 1 CHECK(mockup = 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE media_objects (
  version_id TEXT PRIMARY KEY REFERENCES asset_versions(id),
  asset_id TEXT NOT NULL REFERENCES catalog_assets(id),
  batch_id TEXT REFERENCES media_import_batches(id),
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE CHECK(length(sha256)=64),
  byte_size INTEGER NOT NULL CHECK(byte_size > 0),
  width INTEGER NOT NULL CHECK(width > 0),
  height INTEGER NOT NULL CHECK(height > 0),
  mime_type TEXT NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','image/webp')),
  image_type TEXT NOT NULL CHECK(image_type IN ('product','brand','campaign','editorial')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE media_product_images (
  product_id TEXT NOT NULL REFERENCES media_products(id),
  version_id TEXT NOT NULL REFERENCES media_objects(version_id),
  role TEXT NOT NULL DEFAULT 'gallery' CHECK(role IN ('primary','gallery','detail')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(product_id,version_id)
);

CREATE TABLE media_brand_images (
  brand_id TEXT NOT NULL REFERENCES media_brands(id),
  version_id TEXT NOT NULL REFERENCES media_objects(version_id),
  PRIMARY KEY(brand_id,version_id)
);

CREATE TABLE media_campaign_images (
  campaign_id TEXT NOT NULL REFERENCES media_campaigns(id),
  version_id TEXT NOT NULL REFERENCES media_objects(version_id),
  PRIMARY KEY(campaign_id,version_id)
);

CREATE INDEX media_products_brand ON media_products(brand_id,name);
CREATE INDEX media_objects_batch ON media_objects(batch_id,created_at);
CREATE INDEX media_objects_active ON media_objects(active,created_at);
CREATE INDEX media_product_images_version ON media_product_images(version_id,product_id);
CREATE INDEX media_brand_images_version ON media_brand_images(version_id,brand_id);
CREATE INDEX media_campaign_images_version ON media_campaign_images(version_id,campaign_id);
