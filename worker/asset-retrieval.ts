import { retrievalRequest, type RetrievalRequest } from './asset-contracts'
import { readerEligibility } from './asset-store'

// A future Vectorize retriever can implement this interface. Every backend must
// hydrate/recheck authoritative D1 versions/grants before producing reader hits.
export interface AssetRetriever { retrieve(input: unknown): Promise<{ source: string; items: Record<string, unknown>[]; preferencesStored: false }> }
export class D1AssetRetriever implements AssetRetriever {
  constructor(private db: D1Database) {}
  async retrieve(input: unknown) {
    const r: RetrievalRequest = retrievalRequest.parse(input)
    let seed = 2166136261; for (const c of r.seed) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0
    const params = JSON.stringify({ ...r, tags: r.tags.map(t => t.toLowerCase()), seed: seed % 2147483647 })
    const eligible = readerEligibility('v.id')
    const publicationFilter=r.publishedOnly?`AND EXISTS(SELECT 1 FROM catalog_publications pub JOIN content_catalog_links l ON l.asset_version=pub.version_id JOIN content_versions cv ON cv.id=l.content_version JOIN content_nodes n ON n.id=cv.node_id WHERE pub.version_id=v.id AND n.latest_version=cv.id AND n.availability='active')`:''
    const result = await this.db.prepare(`WITH pool AS (
      SELECT a.id AS asset_id,a.image_url,v.id AS version_id,v.sequence,v.sha256 AS image_sha256,
        COALESCE(s.canonical_brand_id,p.source_id,a.id) AS brand_key,
        permission.evidence AS analysis_evidence,s.brand_name AS verified_brand,p.publisher_name,p.campaign_title,p.source_page,
        COALESCE(p.hints_json,'{}') AS hints_json,i.output_json AS intelligence_json,
        CASE WHEN i.id IS NOT NULL THEN i.origin ELSE 'editorial_hints' END AS classification_source,
        ${eligible} AS reader_eligible
      FROM catalog_assets a JOIN asset_versions v ON v.id=(SELECT id FROM asset_versions WHERE asset_id=a.id ORDER BY sequence DESC LIMIT 1)
      LEFT JOIN publisher_metadata p ON p.sequence=(SELECT sequence FROM publisher_metadata WHERE version_id=v.id ORDER BY CASE WHEN source_id=(SELECT source_id FROM reader_asset_reviews WHERE version_id=v.id) THEN 0 ELSE 1 END,sequence DESC LIMIT 1)
      LEFT JOIN source_identity_reviews s ON s.source_id=p.source_id
      LEFT JOIN asset_permissions permission ON permission.version_id=v.id AND permission.purpose='ai_analysis'
      LEFT JOIN asset_analysis_jobs job ON job.cache_key=(SELECT cache_key FROM asset_analysis_jobs WHERE version_id=v.id AND state='succeeded'
        AND (origin='meta' AND permission.status='approved' AND permission_revision=permission.revision OR origin='mock' AND json_extract(?1,'$.includeMock')=1)
        ORDER BY CASE origin WHEN 'meta' THEN 0 ELSE 1 END,updated_at DESC,cache_key LIMIT 1)
      LEFT JOIN asset_intelligence i ON i.id=job.intelligence_id
      WHERE a.archived_at IS NULL AND (json_extract(?1,'$.scope')='review' OR ${eligible}) ${publicationFilter}
    ), components AS (
      SELECT pool.*,
        CASE WHEN intelligence_json IS NOT NULL THEN (SELECT COALESCE(SUM(CAST(c.value AS REAL)*COALESCE(json_extract(?1,'$.allocations.'||c.key),0)/100),0) FROM json_each(intelligence_json,'$.categoryScores') c)
          ELSE (SELECT COALESCE(SUM(COALESCE(json_extract(?1,'$.allocations.'||c.value),0)/100),0) FROM json_each(hints_json,'$.categories') c) END AS category_score,
        CASE WHEN intelligence_json IS NOT NULL THEN (SELECT COALESCE(AVG(COALESCE(json_extract(intelligence_json,'$.aestheticScores."'||q.value||'"'),0)),0) FROM json_each(?1,'$.aesthetics') q)
          ELSE (SELECT COALESCE(AVG(EXISTS(SELECT 1 FROM json_each(hints_json,'$.aesthetics') h WHERE h.value=q.value)),0) FROM json_each(?1,'$.aesthetics') q) END AS aesthetic_score,
        (SELECT COALESCE(AVG(EXISTS(SELECT 1 FROM json_each(COALESCE(intelligence_json,hints_json),'$.tags') t WHERE lower(trim(t.value))=q.value)),0) FROM json_each(?1,'$.tags') q) AS tag_score
      FROM pool WHERE
        (json_extract(?1,'$.categoryFilter') IS NULL OR COALESCE(json_extract(intelligence_json,'$.categoryScores.'||json_extract(?1,'$.categoryFilter')),0)>=0.5 OR intelligence_json IS NULL AND EXISTS(SELECT 1 FROM json_each(hints_json,'$.categories') h WHERE h.value=json_extract(?1,'$.categoryFilter')))
        AND (json_extract(?1,'$.aestheticFilter') IS NULL OR COALESCE(json_extract(intelligence_json,'$.aestheticScores."'||json_extract(?1,'$.aestheticFilter')||'"'),0)>=0.5 OR intelligence_json IS NULL AND EXISTS(SELECT 1 FROM json_each(hints_json,'$.aesthetics') h WHERE h.value=json_extract(?1,'$.aestheticFilter')))
    ), scores AS (
      SELECT components.*,0.6*category_score+0.3*aesthetic_score+0.1*tag_score AS relevance,
        ((sequence%2147483647)*1103515245+json_extract(?1,'$.seed')*12345)%2147483647/2147483647.0 AS exploration FROM components
    ), varied AS (
      SELECT scores.*,(1-json_extract(?1,'$.serendipity'))*relevance+json_extract(?1,'$.serendipity')*exploration AS score,
        ROW_NUMBER() OVER(PARTITION BY brand_key ORDER BY relevance DESC,asset_id) AS brand_rank FROM scores WHERE relevance>0
    ) SELECT asset_id,version_id,image_sha256,analysis_evidence,intelligence_json,image_url,verified_brand,publisher_name,campaign_title,source_page,
      classification_source,reader_eligible,category_score,aesthetic_score,tag_score,relevance,
      score-CASE WHEN json_extract(?1,'$.brandDiversity') THEN 0.12*(brand_rank-1) ELSE 0 END AS ranking_score
      FROM varied ORDER BY ranking_score DESC,asset_id LIMIT ?2`).bind(params,r.limit).all()
    return { source: 'd1_metadata', items: result.results, preferencesStored: false as const }
  }
}
