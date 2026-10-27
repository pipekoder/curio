import { z } from 'zod'
import { D1Catalog, candidateIds, CatalogConflict } from './catalog-store'
import { discoveryImport, discoveryItem, identityReview, readerReview, type DiscoveryItem } from './asset-contracts'

const stamp = () => new Date().toISOString()
export class AssetStore {
  constructor(public db: D1Database) {}
  async import(input: unknown) {
    const manifest = discoveryImport.parse(input), base = new D1Catalog(this.db)
    if (manifest.sources.length) await base.ingest({ schemaVersion: 1, sources: manifest.sources, candidates: [] }, 'asset-intelligence-operator')
    await this.discovered(manifest.items)
    const result = manifest.items.length ? await base.ingest({ schemaVersion: 1, sources: [], candidates: manifest.items.map(i => i.candidate) }, 'asset-intelligence-operator') : null
    const statements: D1PreparedStatement[] = []
    for (const item of manifest.items) {
      const { versionId } = await candidateIds(item.candidate.imageUrl, item.candidate.versionKey), p = item.publisher, a = item.access
      statements.push(this.db.prepare(`INSERT INTO publisher_metadata(version_id,source_id,publisher_name,campaign_title,description,publisher_alt,hints_json,source_page,observed_at)
        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(version_id,source_id) DO UPDATE SET publisher_name=excluded.publisher_name,campaign_title=excluded.campaign_title,description=excluded.description,publisher_alt=excluded.publisher_alt,hints_json=excluded.hints_json,source_page=excluded.source_page,observed_at=excluded.observed_at`)
        .bind(versionId, item.candidate.sourceId, p.name, p.campaign, p.description, p.alt, JSON.stringify(p.hints), p.sourcePage, item.candidate.retrievedAt))
      statements.push(this.db.prepare('INSERT INTO asset_access_checks(version_id,status,transport,http_status,content_type,checked_at) VALUES(?,?,?,?,?,?)')
        .bind(versionId, a.status, a.transport, a.httpStatus, a.contentType, item.candidate.retrievedAt))
    }
    if (statements.length) await this.db.batch(statements)
    return { imported: result?.submitted ?? 0, records: result?.records ?? [] }
  }
  async discovered(items: DiscoveryItem[]) {
    if (!items.length) return
    const validated = items.map(item => discoveryItem.parse(item))
    // One statement for a gallery batch, preserving the Workers Free D1 query
    // budget even when a page exposes 100 links. JSON is bound, never SQL text.
    await this.db.prepare(`INSERT INTO discovered_images(image_url,source_id,candidate_json,discovered_at)
      SELECT json_extract(value,'$.candidate.imageUrl'),json_extract(value,'$.candidate.sourceId'),value,json_extract(value,'$.candidate.retrievedAt')
      FROM json_each(?) WHERE true ON CONFLICT(image_url) DO NOTHING`).bind(JSON.stringify(validated)).run()
  }
  async recordSource(sourceId: string, page: string, status: string, httpStatus: number | null, hash: string | null, count: number) {
    await this.db.prepare('INSERT INTO source_observations(source_id,page_url,status,transport,http_status,content_sha256,discovered_count,observed_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(sourceId, page, status, 'worker_fetch', httpStatus, hash, count, stamp()).run()
  }
  async version(id: string) {
    return this.db.prepare(`SELECT v.*,a.image_url,a.archived_at,p.status AS analysis_status,p.evidence AS analysis_evidence,p.revision AS analysis_revision,
      (SELECT id FROM asset_versions WHERE asset_id=a.id ORDER BY sequence DESC LIMIT 1) AS latest_version
      FROM asset_versions v JOIN catalog_assets a ON a.id=v.asset_id JOIN asset_permissions p ON p.version_id=v.id AND p.purpose='ai_analysis' WHERE v.id=?`).bind(id).first<{
        id: string; asset_id: string; image_url: string; sha256: string | null; width: number | null; height: number | null; archived_at: string | null;
        analysis_status: string; analysis_evidence: string | null; analysis_revision: number; latest_version: string
      }>()
  }
  async access(id: string) { return this.db.prepare('SELECT * FROM asset_access_checks WHERE version_id=? ORDER BY sequence DESC LIMIT 1').bind(id).first() }
  async checkAccess(id: string, send: typeof fetch = fetch, assets?: Fetcher) {
    const row = await this.version(id); if (!row || row.archived_at || row.latest_version !== row.id) throw new CatalogConflict('Unknown or stale active image version.')
    // HEAD on a previously imported exact URL, only for server-reviewed media
    // hosts. No GET body, redirects, conversions or remote model processing.
    const { technicalMediaHosts, analysisMediaPermits } = await import('./asset-sources')
    const permit = analysisMediaPermits[id]
    const bundled = permit?.imageUrl === row.image_url && permit.sha256 === row.sha256 && permit.width === row.width && permit.height === row.height && permit.bundledPath && /^\/catalog\/[a-z0-9-]+\.png$/.test(permit.bundledPath) && permit.mime === 'image/png' && assets ? permit.bundledPath : null
    const allowed = Boolean(bundled) || technicalMediaHosts.some(host => host === new URL(row.image_url).hostname)
    if (!allowed) throw new CatalogConflict('This media host needs a server policy review before technical access.')
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000)
    let status: 'reachable' | 'blocked' | 'failed' = 'failed', code: number | null = null, type: string | null = null
    try {
      const response = bundled ? await assets!.fetch(new Request(`https://local-assets.invalid${bundled}`, { method: "HEAD", signal: controller.signal, redirect: "manual" })) : await send(row.image_url, { method: 'HEAD', redirect: 'manual', signal: controller.signal })
      code = response.status; type = response.headers.get('Content-Type')?.split(';')[0] ?? null
      status = response.status === 200 && type?.startsWith('image/') ? 'reachable' : [401,403,429].includes(response.status) ? 'blocked' : 'failed'
      await response.body?.cancel()
    } catch { status = 'failed' } finally { clearTimeout(timer) }
    await this.db.prepare('INSERT INTO asset_access_checks(version_id,status,transport,http_status,content_type,checked_at) VALUES(?,?,?,?,?,?)').bind(id,status,'head',code,type,stamp()).run()
    return { versionId: id, status, httpStatus: code, contentType: type }
  }
  async reviewIdentity(input: unknown) {
    const r = identityReview.parse(input)
    await this.db.prepare(`INSERT INTO source_identity_reviews VALUES(?,?,?,?,?,?) ON CONFLICT(source_id) DO UPDATE SET canonical_brand_id=excluded.canonical_brand_id,brand_name=excluded.brand_name,evidence=excluded.evidence,reviewer=excluded.reviewer,reviewed_at=excluded.reviewed_at`)
      .bind(r.sourceId,r.canonicalBrandId,r.brandName,r.evidence,r.reviewer,stamp()).run()
  }
  async reviewReader(input: unknown) {
    const r = readerReview.parse(input)
    const result = await this.db.prepare(`INSERT INTO reader_asset_reviews SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM publisher_metadata WHERE version_id=? AND source_id=?)
      ON CONFLICT(version_id) DO UPDATE SET source_id=excluded.source_id,alt=excluded.alt,attribution=excluded.attribution,source_page=excluded.source_page,licensing_evidence=excluded.licensing_evidence,reviewer=excluded.reviewer,reviewed_at=excluded.reviewed_at`)
      .bind(r.versionId,r.sourceId,r.alt,r.attribution,r.sourcePage,r.licensingEvidence,r.reviewer,stamp(),r.versionId,r.sourceId).run()
    if (result.meta.changes !== 1) throw new CatalogConflict('Reader review must match a known discovery source/version.')
  }
  async analysisJobs(version: string) { return (await this.db.prepare('SELECT origin,state,model,spec,error_code,updated_at FROM asset_analysis_jobs WHERE version_id=? ORDER BY updated_at DESC LIMIT 20').bind(version).all()).results }
  async discoveredPage(cursor = '', limit = 20) {
    z.string().max(2048).parse(cursor)
    return (await this.db.prepare(`SELECT d.image_url,d.source_id,d.candidate_json,a.id AS imported_asset_id FROM discovered_images d LEFT JOIN catalog_assets a ON a.image_url=d.image_url WHERE d.image_url>? ORDER BY d.image_url LIMIT ?`).bind(cursor, limit).all()).results
  }
  async stages() {
    const counts = await this.db.prepare(`WITH latest AS (SELECT v.*,a.archived_at FROM asset_versions v JOIN catalog_assets a ON a.id=v.asset_id WHERE v.id=(SELECT id FROM asset_versions WHERE asset_id=a.id ORDER BY sequence DESC LIMIT 1))
      SELECT (SELECT COUNT(*) FROM discovered_images) AS discovered,(SELECT COUNT(*) FROM catalog_assets) AS imported,
      COALESCE(SUM(EXISTS(SELECT 1 FROM asset_permissions p WHERE p.version_id=v.id AND p.purpose='display' AND p.status='approved') AND archived_at IS NULL),0) AS display_approved,
      COALESCE(SUM(EXISTS(SELECT 1 FROM asset_analysis_jobs j JOIN asset_permissions p ON p.version_id=j.version_id AND p.purpose='ai_analysis' WHERE j.version_id=v.id AND j.origin='meta' AND j.state='succeeded' AND j.permission_revision=p.revision AND p.status='approved') AND archived_at IS NULL),0) AS ai_enriched,
      COALESCE(SUM(EXISTS(SELECT 1 FROM asset_analysis_jobs j WHERE j.version_id=v.id AND j.origin='mock' AND j.state='succeeded') AND archived_at IS NULL),0) AS mock_enriched,
      COALESCE(SUM(${readerEligibility('v.id')} AND archived_at IS NULL),0) AS reader_eligible FROM latest v`).first()
    return { counts, publicReaderConnected: false, vectorizeRequired: false, libraryLimit: null }
  }
}
// D1 review readiness, not authority to bypass the existing public exact-URL
// registry. Public reader integration remains a separately reviewed rollout.
export function readerEligibility(version = 'v.id') {
  return `EXISTS(SELECT 1 FROM reader_asset_reviews r JOIN source_identity_reviews s ON s.source_id=r.source_id JOIN asset_permissions p ON p.version_id=r.version_id AND p.purpose='display'
    WHERE r.version_id=${version} AND p.status='approved' AND p.evidence IS NOT NULL AND p.rights_holder IS NOT NULL
    AND (SELECT status FROM asset_access_checks WHERE version_id=r.version_id ORDER BY sequence DESC LIMIT 1)='reachable')`
}
