import type {Bindings} from './index'
import type {EditorialPreferences} from '../shared/editorial'
import type {CatalogItem} from '../shared/catalog'
import type {EditorialSource} from '../shared/editorial-sources'
import type {VisualContext} from '../shared/visual-observations'
import {interestTags} from '../shared/editorial'
import {D1AssetRetriever} from './asset-retrieval'
import {CatalogPublications,publicationApprovals} from './catalog-publications'
import {catalogDigest} from './catalog-store'
import {observationAssetMatches,retrievedVisualContext} from './editorial-visual-context'
import {loadEditorialSources} from './editorial-sources'
import {resolveR2MediaPermit} from './media-ai-adapter'
import {loadApprovedCulturalEvidence,culturalSourcesForEditorial} from './cultural-evidence-store'

export type ArticlePool={items:CatalogItem[];sources:EditorialSource[];visualContexts:VisualContext[];eligibleCount:number}

// The D1 query scores the full eligible published catalog before limiting its
// ranked hydration window. We verify up to 96 versions, then send at most 24
// distinct images to Muse. This bounds prompt size and R2 HEAD requests, not
// the catalog's publication eligibility or a six-version pilot allowlist.
export async function editorialArticlePool(env:Bindings,p:EditorialPreferences):Promise<ArticlePool>{
  if(!env.CATALOG_DB||!env.MEDIA_BUCKET||env.CATALOG_PUBLIC_ENABLED!=='true')return {items:[],sources:[],visualContexts:[],eligibleCount:0}
  const ranked=await new D1AssetRetriever(env.CATALOG_DB).retrieve({
    allocations:p.allocations,aesthetics:p.aesthetics,tags:interestTags(p.interests),
    editorialTerms:[...new Set((p.interests.toLowerCase().match(/[a-z]{4,24}/g)??[]).filter(term=>!['about','with','from','that','this','what','where','their','through','explore','story','stories'].includes(term)))].slice(0,12),
    brandDiversity:true,serendipity:p.mode==='Surprise Me'?0.15:0,
    seed:(await catalogDigest(p.interests)).slice(0,40),scope:'reader',publishedOnly:true,limit:96,
  })
  const ids=ranked.items.map(row=>String(row.version_id))
  const published=(await new CatalogPublications(env.CATALOG_DB).list('',96,ids)).items
  const approvals=publicationApprovals(published)
  const candidates=ranked.items.flatMap(row=>{
    const item=published.find(value=>observationAssetMatches(row,value,approvals))
    if(!item||p.allocations[item.category]<=0||row.editorial_ready!==1||row.classification_source!=='meta'||item.permissions.aiAnalysis.status!=='approved'||!item.permissions.aiAnalysis.evidence)return []
    const context=retrievedVisualContext(row,item,approvals)
    return context?.source==='meta_image_observation'?[{item,context,sha:String(row.image_sha256)}]:[]
  })
  const verified=[] as typeof candidates
  const seenSha=new Set<string>()
  for(const candidate of candidates){
    if(verified.length>=24)break
    if(!/^[a-f0-9]{64}$/.test(candidate.sha)||seenSha.has(candidate.sha))continue
    const permit=await resolveR2MediaPermit(env.CATALOG_DB,candidate.item.image.id)
    if(!permit||permit.sha256!==candidate.sha)continue
    const object=await env.MEDIA_BUCKET.head(permit.r2Key)
    if(object?.size!==permit.byteSize||object.customMetadata?.sha256!==candidate.sha||object.customMetadata?.versionId!==candidate.item.image.id)continue
    verified.push(candidate);seenSha.add(candidate.sha)
  }
  const allSources=await loadEditorialSources(env.CATALOG_DB,verified.map(row=>row.item.image.id),{maxSources:300,maxBytes:96_000})
  const ready=verified.filter(row=>allSources.some(source=>source.assetId===row.item.image.id&&source.kind==='brand_name')&&allSources.some(source=>source.assetId===row.item.image.id&&source.kind==='product_description'))
  const activeIds=ready.map(row=>row.item.image.id)
  const culturalPack=env.CULTURAL_INTELLIGENCE_V3_ENABLED==='true'?await loadApprovedCulturalEvidence(env.MEDIA_BUCKET,activeIds).catch(()=>null):null
  const cultural=culturalPack?culturalSourcesForEditorial(culturalPack,activeIds):[]
  return {items:ready.map(row=>row.item),visualContexts:ready.map(row=>row.context),sources:[...allSources.filter(source=>activeIds.includes(source.assetId)),...cultural],eligibleCount:ready.length}
}
