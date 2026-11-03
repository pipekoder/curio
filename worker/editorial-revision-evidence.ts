import type {Bindings} from './index'
import type {ArticleEditionBody} from '../shared/editorial-articles'
import type {EditorialSource} from '../shared/editorial-sources'
import {CatalogPublications,publicationApprovals} from './catalog-publications'
import {readerEligibility} from './asset-store'
import {resolveR2MediaPermit} from './media-ai-adapter'
import {retrievedVisualContext} from './editorial-visual-context'
import {loadEditorialSources} from './editorial-sources'
import {loadApprovedCulturalEvidence,culturalSourcesForEditorial} from './cultural-evidence-store'
import {ANALYSIS_SPEC} from './asset-classifier'
import {researchReferencesCurrent,validateArticleEdition} from './editorial-articles'

// Exact-version revalidation; no prompt replay, ranking, or new image inference.
export async function revisionEvidence(env:Bindings,edition:ArticleEditionBody,research:EditorialSource[]=[]){
 const db=env.CATALOG_DB,bucket=env.MEDIA_BUCKET
 if(!db||!bucket||env.CATALOG_PUBLIC_ENABLED!=='true')throw Error('Article evidence unavailable.')
 const ids=[...new Set(edition.articles.flatMap(article=>article.images.map(image=>image.assetId)))]
 if(ids.length<2||ids.length>9||!researchReferencesCurrent(research,env.RESEARCH_SOURCE_ORIGINS))throw Error('Article evidence unavailable.')
 const published=(await new CatalogPublications(db).list('',60,ids)).items
 if(published.length!==ids.length||ids.some(id=>!published.some(item=>item.image.id===id)))throw Error('Article evidence unavailable.')
 const approvals=publicationApprovals(published),contexts=[]
 for(const id of ids){
  const item=published.find(value=>value.image.id===id)!
  if(item.permissions.aiAnalysis.status!=='approved'||!item.permissions.aiAnalysis.evidence)throw Error('Article evidence unavailable.')
  const permit=await resolveR2MediaPermit(db,id)
  if(!permit||permit.sha256.length!==64||permit.analysisEvidence!==item.permissions.aiAnalysis.evidence)throw Error('Article evidence unavailable.')
  const media=await bucket.head(permit.r2Key)
  if(!media||media.size!==permit.byteSize||media.customMetadata?.sha256!==permit.sha256||media.customMetadata?.versionId!==id)throw Error('Article evidence unavailable.')
  const hit=await db.prepare(`SELECT a.image_url,v.id AS version_id,v.sha256 AS image_sha256,p.evidence AS analysis_evidence,
   i.output_json AS intelligence_json,i.origin AS classification_source,${readerEligibility('v.id')} AS reader_eligible
   FROM asset_versions v JOIN catalog_assets a ON a.id=v.asset_id
   JOIN asset_permissions p ON p.version_id=v.id AND p.purpose='ai_analysis'
   JOIN asset_analysis_jobs j ON j.version_id=v.id AND j.state='succeeded' AND j.origin='meta' AND j.model='muse-spark-1.3'
    AND j.spec=? AND j.permission_revision=p.revision AND j.image_sha256=v.sha256
   JOIN asset_intelligence i ON i.id=j.intelligence_id
   WHERE v.id=? ORDER BY j.updated_at DESC LIMIT 1`).bind(ANALYSIS_SPEC,id).first<Record<string,unknown>>()
  if(!hit||hit.image_sha256!==permit.sha256)throw Error('Article evidence unavailable.')
  const context=retrievedVisualContext(hit,item,approvals)
  if(!context)throw Error('Article evidence unavailable.')
  contexts.push(context)
 }
 const ownerSources=await loadEditorialSources(db,ids,{maxSources:300,maxBytes:524_288})
 const cultural=[]
 if(env.CULTURAL_INTELLIGENCE_V3_ENABLED==='true')for(const article of edition.articles){
  const selected=article.images.map(image=>image.assetId)
  const pack=await loadApprovedCulturalEvidence(bucket,selected)
  if(pack)cultural.push(...culturalSourcesForEditorial(pack,selected))
 }
 const sources=[...ownerSources,...cultural,...research]
 validateArticleEdition(structuredClone(edition),published,sources,contexts,edition.articles.length)
 return {items:published,sources,contexts}
}
