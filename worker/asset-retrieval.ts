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
    // Content Studio media needs real owner-supplied editorial context. Upload
    // defaults establish storage/rights, but never make a metadata-free image a
    // live editorial candidate.
    const editorialReady = `NOT EXISTS(SELECT 1 FROM media_objects media WHERE media.version_id=v.id) OR EXISTS(
      SELECT 1 FROM media_objects media JOIN media_product_images link ON link.version_id=media.version_id
      JOIN media_products product ON product.id=link.product_id JOIN media_brands brand ON brand.id=product.brand_id
      WHERE media.version_id=v.id AND media.active=1 AND media.deleted_at IS NULL
      AND trim(product.name)<>'' AND trim(product.description)<>'' AND trim(brand.name)<>'' AND (trim(brand.story)<>'' OR trim(brand.description)<>'')
    )`
    const publicationFilter=r.publishedOnly?`AND EXISTS(SELECT 1 FROM catalog_publications pub JOIN content_catalog_links l ON l.asset_version=pub.version_id JOIN content_versions cv ON cv.id=l.content_version JOIN content_nodes n ON n.id=cv.node_id WHERE pub.version_id=v.id AND n.latest_version=cv.id AND n.availability='active')`:''
    const result = await this.db.prepare(`WITH pool AS (
      SELECT a.id AS asset_id,a.image_url,v.id AS version_id,v.sequence,v.sha256 AS image_sha256,
        COALESCE((SELECT product.brand_id FROM media_product_images link JOIN media_products product ON product.id=link.product_id WHERE link.version_id=v.id LIMIT 1),s.canonical_brand_id,p.source_id,a.id) AS brand_key,
        permission.evidence AS analysis_evidence,s.brand_name AS verified_brand,p.publisher_name,p.campaign_title,p.source_page,
        COALESCE(p.hints_json,'{}') AS hints_json,i.output_json AS intelligence_json,
        CASE WHEN i.id IS NOT NULL THEN i.origin ELSE 'editorial_hints' END AS classification_source,
        ${eligible} AS reader_eligible,CASE WHEN ${editorialReady} THEN 1 ELSE 0 END AS editorial_ready
      FROM catalog_assets a JOIN asset_versions v ON v.id=(SELECT id FROM asset_versions WHERE asset_id=a.id ORDER BY sequence DESC LIMIT 1)
      LEFT JOIN publisher_metadata p ON p.sequence=(SELECT sequence FROM publisher_metadata WHERE version_id=v.id ORDER BY CASE WHEN source_id=(SELECT source_id FROM reader_asset_reviews WHERE version_id=v.id) THEN 0 ELSE 1 END,sequence DESC LIMIT 1)
      LEFT JOIN source_identity_reviews s ON s.source_id=p.source_id
      LEFT JOIN asset_permissions permission ON permission.version_id=v.id AND permission.purpose='ai_analysis'
      LEFT JOIN asset_analysis_jobs job ON job.cache_key=(SELECT cache_key FROM asset_analysis_jobs WHERE version_id=v.id AND state='succeeded'
        AND (origin='meta' AND permission.status='approved' AND permission_revision=permission.revision OR origin='mock' AND json_extract(?1,'$.includeMock')=1)
        ORDER BY CASE origin WHEN 'meta' THEN 0 ELSE 1 END,updated_at DESC,cache_key LIMIT 1)
      LEFT JOIN asset_intelligence i ON i.id=job.intelligence_id
      WHERE a.archived_at IS NULL ${publicationFilter}
    ), components AS (
      SELECT components_version.*,
        CASE WHEN intelligence_json IS NOT NULL THEN (SELECT COALESCE(SUM(CAST(c.value AS REAL)*COALESCE(json_extract(?1,'$.allocations.'||c.key),0)/100),0) FROM json_each(intelligence_json,'$.categoryScores') c)
          ELSE (SELECT COALESCE(SUM(COALESCE(json_extract(?1,'$.allocations.'||c.value),0)/100),0) FROM json_each(hints_json,'$.categories') c) END AS category_score,
        CASE WHEN intelligence_json IS NOT NULL THEN (SELECT COALESCE(AVG(COALESCE(json_extract(intelligence_json,'$.aestheticScores."'||q.value||'"'),0)),0) FROM json_each(?1,'$.aesthetics') q)
          ELSE (SELECT COALESCE(AVG(EXISTS(SELECT 1 FROM json_each(hints_json,'$.aesthetics') h WHERE h.value=q.value)),0) FROM json_each(?1,'$.aesthetics') q) END AS aesthetic_score,
        (SELECT COALESCE(AVG(EXISTS(SELECT 1 FROM json_each(COALESCE(intelligence_json,hints_json),'$.tags') t WHERE lower(trim(t.value))=q.value)),0) FROM json_each(?1,'$.tags') q) AS tag_score,
        (SELECT COALESCE(AVG(EXISTS(SELECT 1 FROM media_product_images link JOIN media_products product ON product.id=link.product_id JOIN media_brands brand ON brand.id=product.brand_id
          WHERE link.version_id=components_version.version_id AND lower(product.name||' '||product.description||' '||brand.name||' '||COALESCE(brand.story,'')||' '||COALESCE(brand.description,'')) LIKE '%'||q.value||'%')),0)
          FROM json_each(?1,'$.editorialTerms') q) AS editorial_score
      FROM pool AS components_version WHERE (json_extract(?1,'$.scope')='review' OR reader_eligible=1 AND editorial_ready=1) AND
        (json_extract(?1,'$.categoryFilter') IS NULL OR COALESCE(json_extract(intelligence_json,'$.categoryScores.'||json_extract(?1,'$.categoryFilter')),0)>=0.5 OR intelligence_json IS NULL AND EXISTS(SELECT 1 FROM json_each(hints_json,'$.categories') h WHERE h.value=json_extract(?1,'$.categoryFilter')))
        AND (json_extract(?1,'$.aestheticFilter') IS NULL OR COALESCE(json_extract(intelligence_json,'$.aestheticScores."'||json_extract(?1,'$.aestheticFilter')||'"'),0)>=0.5 OR intelligence_json IS NULL AND EXISTS(SELECT 1 FROM json_each(hints_json,'$.aesthetics') h WHERE h.value=json_extract(?1,'$.aestheticFilter')))
    ), scores AS (
      SELECT components.*,CASE WHEN json_array_length(json_extract(?1,'$.editorialTerms'))>0
          THEN 0.45*category_score+0.25*aesthetic_score+0.1*tag_score+0.2*editorial_score
          ELSE 0.6*category_score+0.3*aesthetic_score+0.1*tag_score END AS relevance,
        ((sequence%2147483647)*1103515245+json_extract(?1,'$.seed')*12345)%2147483647/2147483647.0 AS exploration FROM components
    ), varied AS (
      -- Only the article-preparation caller opts into unscored records. The
      -- existing reviewer and reader ranking behavior stays unchanged.
      SELECT scores.*,(1-json_extract(?1,'$.serendipity'))*relevance+json_extract(?1,'$.serendipity')*exploration AS score,
        ROW_NUMBER() OVER(PARTITION BY brand_key ORDER BY relevance DESC,asset_id) AS brand_rank FROM scores WHERE relevance>0 OR json_extract(?1,'$.scope')='review' AND json_extract(?1,'$.includeUnscored')=1
    ) SELECT asset_id,version_id,image_sha256,analysis_evidence,intelligence_json,image_url,verified_brand,publisher_name,campaign_title,source_page,
      classification_source,reader_eligible,editorial_ready,category_score,aesthetic_score,tag_score,relevance,
      score-CASE WHEN json_extract(?1,'$.brandDiversity') THEN 0.12*(brand_rank-1) ELSE 0 END AS ranking_score
      FROM varied ORDER BY ranking_score DESC,asset_id LIMIT ?2`).bind(params,r.limit).all()
    return { source: 'd1_metadata', items: result.results, preferencesStored: false as const }
  }
}
