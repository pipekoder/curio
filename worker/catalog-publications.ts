import { z } from 'zod'
import { catalogItem, type CatalogItem } from '../shared/catalog'
import type { ExternalAssetApprovals } from '../shared/url-policy'
import { curationCatalog } from '../shared/catalog'
import { readerEligibility } from './asset-store'
import { CatalogConflict } from './catalog-store'
// This is an explicit operator publication record, never a discovery flag or
// model-generated approval. D1 exact-version grants remain the source of truth.
export class CatalogPublications {
  constructor(private db:D1Database){}
  async publish(input:unknown){
    const r=z.strictObject({versionId:z.string().regex(/^version-[a-f0-9]{64}$/),item:catalogItem,reviewer:z.string().min(1).max(200)}).parse(input)
    const row=await this.db.prepare(`SELECT a.image_url,a.archived_at,v.*,p.status AS display_status,p.evidence AS display_evidence,s.brand_name,r.alt AS reviewed_alt,r.attribution AS reviewed_attribution,r.source_page,${readerEligibility('v.id')} AS eligible,
      (SELECT latest_version FROM content_nodes n JOIN content_versions cv ON cv.node_id=n.id JOIN content_catalog_links l ON l.content_version=cv.id WHERE l.asset_version=v.id LIMIT 1) AS current_content,
      (SELECT status FROM content_reviews cr JOIN content_catalog_links l ON l.content_version=cr.version_id WHERE l.asset_version=v.id AND cr.purpose='display' ORDER BY cr.sequence DESC LIMIT 1) AS content_status,
      (SELECT l.content_version FROM content_catalog_links l WHERE l.asset_version=v.id LIMIT 1) AS linked_content,
      (SELECT n.availability FROM content_nodes n JOIN content_versions cv ON cv.node_id=n.id JOIN content_catalog_links l ON l.content_version=cv.id WHERE l.asset_version=v.id LIMIT 1) AS availability
      FROM asset_versions v JOIN catalog_assets a ON a.id=v.asset_id JOIN asset_permissions p ON p.version_id=v.id AND p.purpose='display'
      JOIN reader_asset_reviews r ON r.version_id=v.id JOIN source_identity_reviews s ON s.source_id=r.source_id WHERE v.id=? AND v.id=(SELECT id FROM asset_versions WHERE asset_id=a.id ORDER BY sequence DESC LIMIT 1)`).bind(r.versionId).first<Record<string,unknown>>()
    if(!row||row.content_status!=='approved'||r.item.id!==`catalog-${String(row.asset_id).slice(6,46)}`||curationCatalog.some(a=>a.id===r.item.id)||r.item.verifiedBrandLink!==null||row.archived_at||row.eligible!==1||row.availability!=='active'||row.current_content!==row.linked_content||!row.sha256||row.width!==r.item.image.width||row.height!==r.item.image.height||row.image_url!==r.item.image.externalUrl||r.item.image.id!==r.versionId||r.item.image.path||r.item.licensing.status!=='cleared'||r.item.permissions.display.status!=='approved'||r.item.permissions.display.evidence!==row.display_evidence||r.item.image.alt!==row.reviewed_alt||r.item.provenance.attribution!==row.reviewed_attribution||r.item.provenance.originalSourcePage!==row.source_page)throw new CatalogConflict('Exact active version, provenance, fingerprint and independent reader/display reviews required.')
    if(r.item.sourceType==='licensed_brand'&&r.item.advertiser?.name!==row.brand_name)throw new CatalogConflict('Verified advertiser identity must match.')
    for(const purpose of ['ai_analysis','edits'] as const){const permission=r.item.permissions[purpose==='ai_analysis'?'aiAnalysis':'edits'];if(permission.status==='approved'){const grant=await this.db.prepare('SELECT status,evidence FROM asset_permissions WHERE version_id=? AND purpose=?').bind(r.versionId,purpose).first();if(grant?.status!=='approved'||grant.evidence!==permission.evidence)throw new CatalogConflict('Independent purpose grant required.')}}
    const duplicate=await this.db.prepare(`SELECT pub.version_id FROM catalog_publications pub JOIN asset_versions v ON v.id=pub.version_id JOIN catalog_assets a ON a.id=v.asset_id JOIN asset_permissions p ON p.version_id=v.id AND p.purpose='display' WHERE v.sha256=? AND v.asset_id<>? AND p.status='approved' AND a.archived_at IS NULL LIMIT 1`).bind(row.sha256,row.asset_id).first()
    if(duplicate)throw new CatalogConflict('Review the existing published fingerprint before publishing an alias.')
    // Recheck publication prerequisites in public read as well as at approval.
    await this.db.prepare('INSERT INTO catalog_publications VALUES(?,?,?,?) ON CONFLICT(version_id) DO UPDATE SET catalog_json=excluded.catalog_json,reviewer=excluded.reviewer,reviewed_at=excluded.reviewed_at').bind(r.versionId,JSON.stringify(r.item),r.reviewer,new Date().toISOString()).run()
    await this.db.prepare(`UPDATE publisher_metadata SET hints_json=? WHERE version_id=? AND source_id=(SELECT source_id FROM reader_asset_reviews WHERE version_id=?)`).bind(JSON.stringify({categories:[r.item.category],aesthetics:r.item.lifestyleTags,tags:r.item.discoverableObjects.map(o=>o.label).slice(0,10)}),r.versionId,r.versionId).run()
    return {publishedForReader:true,versionId:r.versionId,aiCalls:0}
  }
  async list(cursor='',limit=50,versions:readonly string[]|null=null){
    const rows=await this.db.prepare(`SELECT pub.version_id,pub.catalog_json,p.evidence AS display_evidence,(SELECT status FROM content_reviews cr WHERE cr.version_id=cv.id AND cr.purpose='ai_analysis' ORDER BY cr.sequence DESC LIMIT 1) AS content_analysis_status FROM catalog_publications pub JOIN asset_versions v ON v.id=pub.version_id JOIN catalog_assets a ON a.id=v.asset_id
      JOIN asset_permissions p ON p.version_id=v.id AND p.purpose='display' JOIN reader_asset_reviews rr ON rr.version_id=v.id JOIN content_catalog_links l ON l.asset_version=v.id JOIN content_versions cv ON cv.id=l.content_version JOIN content_nodes n ON n.id=cv.node_id
      WHERE v.id>? AND (? IS NULL OR v.id IN(SELECT value FROM json_each(?))) AND a.archived_at IS NULL AND v.id=(SELECT id FROM asset_versions WHERE asset_id=a.id ORDER BY sequence DESC LIMIT 1) AND n.latest_version=cv.id AND n.availability='active' AND ${readerEligibility('v.id')}
      AND rr.alt=json_extract(pub.catalog_json,'$.image.alt') AND rr.attribution=json_extract(pub.catalog_json,'$.provenance.attribution') AND rr.source_page=json_extract(pub.catalog_json,'$.provenance.originalSourcePage') AND a.image_url=json_extract(pub.catalog_json,'$.image.externalUrl') AND COALESCE((SELECT status FROM content_reviews cr WHERE cr.version_id=cv.id AND cr.purpose='display' ORDER BY cr.sequence DESC LIMIT 1),'pending')='approved' AND p.status='approved' AND p.evidence=json_extract(pub.catalog_json,'$.permissions.display.evidence') ORDER BY v.id LIMIT ?`).bind(cursor,versions?JSON.stringify(versions):null,versions?JSON.stringify(versions):null,limit+1).all<{version_id:string;catalog_json:string;display_evidence:string;content_analysis_status:'pending'|'approved'|'rejected'|'blocked'|null}>()
    const grants=(await this.db.prepare(`SELECT version_id,purpose,status,evidence FROM asset_permissions WHERE version_id IN(SELECT value FROM json_each(?))`).bind(JSON.stringify(rows.results.map(r=>{try{return JSON.parse(r.catalog_json).image.id}catch{return ''}}))).all<{version_id:string;purpose:string;status:'pending'|'approved'|'rejected'|'blocked';evidence:string|null}>()).results
    const items:CatalogItem[]=[]
    for(const row of rows.results.slice(0,limit))try{
      const item=catalogItem.parse(JSON.parse(row.catalog_json))
      for(const purpose of ['ai_analysis','edits'] as const){const grant=grants.find(g=>g.version_id===item.image.id&&g.purpose===purpose);if(grant)item.permissions[purpose==='ai_analysis'?'aiAnalysis':'edits']={status:grant.status,evidence:grant.evidence}}
      if(row.content_analysis_status&&row.content_analysis_status!=='approved')item.permissions.aiAnalysis={status:row.content_analysis_status,evidence:null}
      items.push(item)
    }catch{/* invalid publication is unavailable */}
    return {items,nextCursor:rows.results.length>limit?rows.results.slice(0,limit).at(-1)?.version_id??null:null}
  }
}
export function publicationApprovals(items:readonly CatalogItem[]):ExternalAssetApprovals{return Object.fromEntries(items.filter(a=>a.image.externalUrl&&a.permissions.display.evidence).map(a=>[a.image.id,{url:a.image.externalUrl!,sourcePage:a.provenance.originalSourcePage!,displayEvidence:a.permissions.display.evidence!}]))}
