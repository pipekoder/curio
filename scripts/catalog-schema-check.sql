-- Read-only verification; run only after the approved catalog migration.
SELECT name FROM d1_migrations ORDER BY id;
SELECT type, name FROM sqlite_schema
WHERE name IN ('brand_sources','catalog_assets','asset_versions','asset_discoveries',
  'asset_permissions','permission_history','asset_intelligence','editorial_facts',
  'object_regions','catalog_imports','versions_asset','discoveries_source',
  'permissions_status','intelligence_version','facts_source','regions_version',
  'permission_audit') ORDER BY type, name;
PRAGMA table_info(asset_permissions);
PRAGMA foreign_key_check;
PRAGMA quick_check;
SELECT 'sources' AS record_type, COUNT(*) AS count FROM brand_sources
UNION ALL SELECT 'assets', COUNT(*) FROM catalog_assets
UNION ALL SELECT 'versions', COUNT(*) FROM asset_versions;
