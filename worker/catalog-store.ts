import { categories, lifestyles } from '../shared/catalog'
import { annotationRequest, importManifest, permissionReview, queryRequest, type CatalogQuery } from './catalog-contracts'

export class CatalogConflict extends Error {}
const now = () => new Date().toISOString()
const json = (value: unknown): string => JSON.stringify(value)
export async function catalogDigest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('')
}
export async function candidateIds(imageUrl: string, versionKey: string) {
  return { assetId: `asset-${await catalogDigest(imageUrl)}`, versionId: `version-${await catalogDigest(json([imageUrl, versionKey]))}` }
}
// Never fetch URLs here. D1 stores links and reviewed metadata, never image bytes.
export class D1Catalog {
  constructor(private db: D1Database) {}
  async ingest(input: unknown, operator: string) {
    const manifest = importManifest.parse(input), created = now(), id = crypto.randomUUID()
    const statements: D1PreparedStatement[] = []
    for (const source of manifest.sources) statements.push(this.db.prepare(`INSERT INTO brand_sources(id,name,entry_url,kind,issue_url,created_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=CASE WHEN brand_sources.name=excluded.name AND brand_sources.entry_url=excluded.entry_url AND brand_sources.kind=excluded.kind AND brand_sources.issue_url=excluded.issue_url THEN brand_sources.name ELSE NULL END`).bind(source.id, source.name, source.entryUrl, source.kind, source.issueUrl, created))
    const ids = []
    for (const candidate of manifest.candidates) {
      const { assetId, versionId } = await candidateIds(candidate.imageUrl, candidate.versionKey)
      ids.push({ assetId, versionId })
      // Discovery location/date are separately append-only; don't create a new
      // version merely because a source page was found or rechecked later.
      const { sourceId, sourcePage, retrievedAt, ...immutable } = candidate
      const hash = await catalogDigest(json(immutable))
      statements.push(this.db.prepare('INSERT INTO catalog_assets(id,image_url,created_at) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING').bind(assetId, candidate.imageUrl, created))
      statements.push(this.db.prepare(`INSERT INTO asset_versions(id,asset_id,version_key,manifest_hash,sha256,width,height,alt,attribution,source_type,provenance_json,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET manifest_hash =
        CASE WHEN asset_versions.manifest_hash=excluded.manifest_hash THEN asset_versions.manifest_hash ELSE NULL END`)
        .bind(versionId, assetId, candidate.versionKey, hash, candidate.sha256, candidate.width, candidate.height, candidate.alt, candidate.attribution, candidate.sourceType, json(candidate.provenance), created))
      statements.push(this.db.prepare(`INSERT INTO asset_discoveries(version_id,source_id,source_page,retrieved_at) VALUES(?,?,?,?)
        ON CONFLICT(version_id,source_id) DO NOTHING`).bind(versionId, sourceId, sourcePage, retrievedAt))
      for (const purpose of ['display', 'ai_analysis', 'edits']) statements.push(this.db.prepare(`INSERT INTO asset_permissions(version_id,purpose) VALUES(?,?) ON CONFLICT DO NOTHING`).bind(versionId, purpose))
    }
    statements.push(this.db.prepare('INSERT INTO catalog_imports(id,operator,candidate_count,created_at) VALUES(?,?,?,?)').bind(id, operator, manifest.candidates.length, created))
    // D1 batch is transactional: unknown source, duplicate URL or immutable
    // version conflict rolls back the entire import, including its audit row.
    try { await this.db.batch(statements) } catch { throw new CatalogConflict('Import conflicts with existing metadata or an unknown source. Use a new version for changed metadata.') }
    return { importId: id, submitted: manifest.candidates.length, records: ids }
  }
  async listSources() { return (await this.db.prepare('SELECT * FROM brand_sources ORDER BY id LIMIT 200').all()).results }
  async sourceFacts(sourceId: string) {
    return (await this.db.prepare('SELECT * FROM editorial_facts WHERE source_id=? ORDER BY verified_at DESC,id LIMIT 100').bind(sourceId).all()).results
  }
  async get(assetId: string) {
    const asset = await this.db.prepare('SELECT * FROM catalog_assets WHERE id=?').bind(assetId).first<{ id: string; image_url: string; archived_at: string | null; created_at: string }>()
    if (!asset) return null
    const versions = (await this.db.prepare('SELECT * FROM asset_versions WHERE asset_id=? ORDER BY sequence DESC LIMIT 50').bind(assetId).all()).results
    const related = async (table: string) => (await this.db.prepare(`SELECT t.* FROM ${table} t JOIN asset_versions v ON v.id=t.version_id WHERE v.asset_id=? ORDER BY v.sequence DESC LIMIT 100`).bind(assetId).all()).results
    return { ...asset, detailLimits: { versions: 50, perAnnotationType: 100 }, versions, discoveries: await related('asset_discoveries'), permissions: await related('asset_permissions'),
      intelligence: await related('asset_intelligence'), facts: await related('editorial_facts'), regions: await related('object_regions') }
  }
  async query(input: CatalogQuery) {
    const query = queryRequest.parse(input)
    const conditions = ['a.id > ?'], values: (string | number)[] = [query.cursor ?? '']
    if (!query.includeArchived) conditions.push('a.archived_at IS NULL')
    if (query.permission) {
      conditions.push('EXISTS(SELECT 1 FROM asset_permissions p WHERE p.version_id=v.id AND p.purpose=? AND p.status=?)')
      values.push(query.permission, query.status ?? 'approved')
    }
    if (query.category || query.aesthetic) {
      // Only actual Meta interpretations enter retrieval. Mock data remains
      // inspectable but never masquerades as production asset intelligence.
      for (const [group, name] of [['categoryScores', query.category], ['aestheticScores', query.aesthetic]]) if (name) {
        conditions.push(`json_extract(i.output_json, ?) >= 0.5`); values.push(`$.${group}."${name}"`)
      }
    }
    const result = await this.db.prepare(`SELECT a.id,a.image_url,a.archived_at,v.id AS version_id,v.source_type,v.alt,v.width,v.height,
      i.output_json AS intelligence_json FROM catalog_assets a JOIN asset_versions v ON v.id=(SELECT id FROM asset_versions WHERE asset_id=a.id ORDER BY sequence DESC LIMIT 1)
      LEFT JOIN asset_intelligence i ON i.id=(SELECT id FROM asset_intelligence WHERE version_id=v.id AND origin='meta' ORDER BY sequence DESC LIMIT 1)
      WHERE ${conditions.join(' AND ')} ORDER BY a.id LIMIT ?`).bind(...values, query.limit + 1).all()
    const items = result.results.slice(0, query.limit)
    return { items, nextCursor: result.results.length > query.limit ? items.at(-1)!.id : null }
  }
  async review(versionId: string, input: unknown) {
    const r = permissionReview.parse(input)
    const result = await this.db.prepare(`UPDATE asset_permissions SET status=?,evidence=?,rights_holder=?,reviewer=?,reviewed_at=?,revision=revision+1
      WHERE version_id=? AND purpose=? AND revision=? RETURNING revision`).bind(r.status, r.evidence, r.rightsHolder, r.reviewer, now(), versionId, r.purpose, r.expectedRevision).first()
    if (!result) throw new CatalogConflict('Unknown version or stale permission revision.')
    return { revision: r.expectedRevision + 1 }
  }
  async archive(assetId: string, archived: boolean) {
    const result = await this.db.prepare('UPDATE catalog_assets SET archived_at=? WHERE id=?').bind(archived ? now() : null, assetId).run()
    if (result.meta.changes !== 1) throw new CatalogConflict('Unknown asset.')
  }
  async annotate(input: unknown) {
    const data = annotationRequest.parse(input)
    if (data.kind === 'fact') {
      const f = data.record
      // A version-specific fact must cite a source associated with that version.
      const result = await this.db.prepare(`INSERT INTO editorial_facts(id,source_id,version_id,statement,citation_url,publisher,retrieved_at,verified_by,verified_at)
        SELECT ?,?,?,?,?,?,?,?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM asset_discoveries WHERE version_id=? AND source_id=?)`)
        .bind(f.id, f.sourceId, f.versionId, f.statement, f.citationUrl, f.publisher, f.retrievedAt, f.verifiedBy, f.verifiedAt, f.versionId, f.versionId, f.sourceId).run()
      if (result.meta.changes !== 1) throw new CatalogConflict('Fact source does not match its version.')
      return
    }
    const live = data.kind === 'intelligence' ? data.record.origin === 'meta' : data.record.origin === 'sam_detection'
    const gate = `EXISTS(SELECT 1 FROM asset_versions v JOIN catalog_assets a ON a.id=v.asset_id WHERE v.id=? AND a.archived_at IS NULL
      ${live ? "AND EXISTS(SELECT 1 FROM asset_permissions p WHERE p.version_id=v.id AND p.purpose='ai_analysis' AND p.status='approved')" : ''})`
    let result
    if (data.kind === 'intelligence') {
      const i = data.record
      result = await this.db.prepare(`INSERT INTO asset_intelligence(id,version_id,model,origin,output_json,created_at) SELECT ?,?,?,?,?,? WHERE ${gate}`)
        .bind(i.id, i.versionId, i.model, i.origin, json(i.output), now(), i.versionId).run()
    } else {
      const g = data.record
      result = await this.db.prepare(`INSERT INTO object_regions(id,version_id,origin,model,width,height,output_json,created_at)
        SELECT ?,?,?,?,?,?,?,? WHERE ${gate} AND EXISTS(SELECT 1 FROM asset_versions WHERE id=? AND width=? AND height=?)`)
        .bind(g.id, g.versionId, g.origin, g.model, g.width, g.height, json(g.regions), now(), g.versionId, g.versionId, g.width, g.height).run()
    }
    if (result.meta.changes !== 1) throw new CatalogConflict('Unknown, archived, mismatched or analysis-unapproved asset version.')
  }
  async status() {
    const counts = await this.db.prepare(`SELECT COUNT(*) AS candidates, COALESCE(SUM(archived_at IS NULL),0) AS active_candidates,
      COALESCE(SUM(archived_at IS NULL AND EXISTS(SELECT 1 FROM asset_versions v JOIN asset_permissions p ON p.version_id=v.id
        WHERE v.id=(SELECT id FROM asset_versions WHERE asset_id=a.id ORDER BY sequence DESC LIMIT 1) AND p.purpose='display' AND p.status='approved')),0) AS display_approved
      FROM catalog_assets a`).first()
    // Count each latest version once per cell, with separate approval counts.
    const cells = []
    for (const aesthetic of lifestyles) for (const category of categories) {
      const row = await this.db.prepare(`SELECT COUNT(*) AS indexed, SUM(EXISTS(SELECT 1 FROM asset_permissions p WHERE p.version_id=v.id AND p.purpose='display' AND p.status='approved')) AS approved
        FROM catalog_assets a JOIN asset_versions v ON v.id=(SELECT id FROM asset_versions WHERE asset_id=a.id ORDER BY sequence DESC LIMIT 1)
        JOIN asset_intelligence i ON i.id=(SELECT id FROM asset_intelligence WHERE version_id=v.id AND origin='meta' ORDER BY sequence DESC LIMIT 1)
        WHERE a.archived_at IS NULL AND json_extract(i.output_json,?)>=0.5 AND json_extract(i.output_json,?)>=0.5`)
        .bind(`$.categoryScores."${category}"`, `$.aestheticScores."${aesthetic}"`).first()
      cells.push({ aesthetic, category, indexed: row?.indexed ?? 0, approved: row?.approved ?? 0 })
    }
    return { counts, coverage: cells, coverageThreshold: 0.5, targetCandidates: [100, 200], targetPerSource: [5, 20], libraryLimit: null,
      publicCatalogIntegration: false }
  }
}
