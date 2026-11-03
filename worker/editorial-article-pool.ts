import {ZodError} from 'zod'
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
import {ANALYSIS_SPEC} from './asset-classifier'
import {ARTICLE_MAX_EDITION_IMAGES} from '../shared/editorial-articles'

type Exclusion='relevance_or_window'|'publication'|'permissions'|'metadata'|'sources'|'image_integrity'|'observations'|'analysis_processing'|'analysis_failed'|'invalid_observations'|'duplicate_image'
export type ArticlePool={items:CatalogItem[];sources:EditorialSource[];visualContexts:VisualContext[];eligibleCount:number;
  preparation?:{pendingVersionIds:string[];processing:number;failed:number;exclusions:Record<Exclusion,number>;rankedCount:number;evaluatedCount:number;activeMediaCount?:number;publishedInPromptWindow?:number}}
const emptyExclusions=():Record<Exclusion,number>=>({relevance_or_window:0,publication:0,permissions:0,metadata:0,sources:0,image_integrity:0,observations:0,analysis_processing:0,analysis_failed:0,invalid_observations:0,duplicate_image:0})

export type ArticlePoolStage='retrieve'|'publications'|'verify'|'sources'|'jobs'|'cultural'|'evidence'
export class ArticlePoolError extends Error{
  constructor(readonly stage:ArticlePoolStage,readonly cause:unknown){super(`article pool ${stage} failed`)}
}
const stage=async<T>(name:ArticlePoolStage,run:()=>Promise<T>):Promise<T>=>{
  try{return await run()}catch(error){throw new ArticlePoolError(name,error)}
}

// Operator-only failure record for Cloudflare Logs. Classifies the pool
// stage and error family with a correlation ID; never image metadata, R2
// keys, SQL, values, or secrets. The public contract stays untouched.
export function reportArticlePoolFailure(requestId:string,error:unknown,event='article_pool_failure'):{stage:ArticlePoolStage|'unknown';code:string}{
  const cause=error instanceof ArticlePoolError?error.cause:error
  const stage=error instanceof ArticlePoolError?error.stage:'unknown'
  const code=cause instanceof ZodError?'validation':cause instanceof Error&&/d1_|sqlite|database|no such table|no such column|too many.*variable/i.test(cause.message)?'d1':'error'
  const detail=cause instanceof ZodError
    ?cause.issues.map(issue=>`${issue.path.join('.')}:${issue.code}`).join(',').slice(0,200)
    :cause instanceof Error?cause.message.replace(/\s+/g,' ').slice(0,200):'unknown'
  console.error(JSON.stringify({event,requestId,stage,code,detail}))
  return {stage,code}
}

// Review scope preserves relevance ranking while retaining not-yet-analyzed
// assets for preflight. Publication, rights and R2 identity are rechecked
// before a version can be scheduled or sent to the Chief Editor.
export async function editorialArticlePool(env:Bindings,p:EditorialPreferences,options:{diagnostics?:boolean}={}):Promise<ArticlePool>{
  const exclusions=emptyExclusions()
  const unavailable={items:[],sources:[],visualContexts:[],eligibleCount:0,preparation:{pendingVersionIds:[],processing:0,failed:0,exclusions,rankedCount:0,evaluatedCount:0,activeMediaCount:0,publishedInPromptWindow:0}}
  const db=env.CATALOG_DB,bucket=env.MEDIA_BUCKET
  if(!db||!bucket||env.CATALOG_PUBLIC_ENABLED!=='true')return unavailable
  const seed=await stage('retrieve',async()=>(await catalogDigest(p.interests)).slice(0,40))
  const ranked=await stage('retrieve',()=>new D1AssetRetriever(db).retrieve({
    allocations:p.allocations,aesthetics:p.aesthetics,tags:interestTags(p.interests),
    editorialTerms:[...new Set((p.interests.toLowerCase().match(/[a-z]{4,24}/g)??[]).filter(term=>!['about','with','from','that','this','what','where','their','through','explore','story','stories'].includes(term)))].slice(0,12),
    brandDiversity:true,serendipity:p.mode==='Surprise Me'?0.15:0,
    seed,scope:'review',includeUnscored:true,publishedOnly:false,limit:96,
  }))
  // The global inventory count is useful to the operator readiness view, but
  // adds a full media read to every visitor generation and preparation poll.
  const activeCount=options.diagnostics?(await stage('retrieve',async()=>(await db.prepare('SELECT COUNT(*) AS n FROM media_objects WHERE active=1 AND deleted_at IS NULL').first<{n:number}>())?.n??0)):undefined
  if(activeCount!==undefined)exclusions.relevance_or_window=Math.max(0,activeCount-ranked.items.length)
  const ids=ranked.items.map(row=>String(row.version_id))
  const published=(await stage('publications',()=>new CatalogPublications(db).list('',96,ids))).items
  const byVersion=new Map(published.map(item=>[item.image.id,item]))
  const approvals=publicationApprovals(published)
  const verified:{item:CatalogItem;row:Record<string,unknown>;context:VisualContext|null}[]=[]
  const seenSha=new Set<string>()
  let evaluatedCount=0,r2Checks=0
  for(const row of ranked.items){
    if(verified.length>=ARTICLE_MAX_EDITION_IMAGES||r2Checks>=32)break
    evaluatedCount++
    const item=byVersion.get(String(row.version_id))
    if(!item){exclusions.publication++;continue}
    if(row.reader_eligible!==1||!observationAssetMatches(row,item,approvals)||item.permissions.aiAnalysis.status!=='approved'||!item.permissions.aiAnalysis.evidence){exclusions.permissions++;continue}
    if(row.editorial_ready!==1||p.allocations[item.category]<=0){exclusions.metadata++;continue}
    const sha=String(row.image_sha256)
    if(!/^[a-f0-9]{64}$/.test(sha)){exclusions.image_integrity++;continue}
    if(seenSha.has(sha)){exclusions.duplicate_image++;continue}
    r2Checks++
    const permit=await stage('verify',()=>resolveR2MediaPermit(db,item.image.id))
    if(!permit||permit.sha256!==sha){exclusions.image_integrity++;continue}
    const object=await stage('verify',()=>bucket.head(permit.r2Key))
    if(object?.size!==permit.byteSize||object.customMetadata?.sha256!==sha||object.customMetadata?.versionId!==item.image.id){exclusions.image_integrity++;continue}
    seenSha.add(sha)
    verified.push({item,row,context:retrievedVisualContext(row,item,approvals)})
  }
  const allSources=await stage('sources',()=>loadEditorialSources(db,verified.map(row=>row.item.image.id),{maxSources:300,maxBytes:524_288}))
  const sourced=verified.filter(row=>{
    const found=allSources.some(source=>source.assetId===row.item.image.id&&source.kind==='brand_name')&&allSources.some(source=>source.assetId===row.item.image.id&&source.kind==='product_description')
    if(!found)exclusions.sources++
    return found
  })
  const pending=sourced.filter(row=>!row.context)
  const jobRows=pending.length?(await stage('jobs',()=>db.prepare(`SELECT j.version_id,j.state,j.lease_until FROM asset_analysis_jobs j JOIN asset_permissions p ON p.version_id=j.version_id AND p.purpose='ai_analysis'
    WHERE j.version_id IN(SELECT value FROM json_each(?)) AND j.origin='meta' AND j.model='muse-spark-1.3' AND j.spec=?
    AND j.permission_revision=p.revision AND j.image_sha256=(SELECT sha256 FROM asset_versions WHERE id=j.version_id)
    ORDER BY j.updated_at DESC`).bind(JSON.stringify(pending.map(row=>row.item.image.id)),ANALYSIS_SPEC).all<{version_id:string;state:string;lease_until:number|null}>())).results:[]
  const jobByVersion=new Map<string,string>()
  for(const job of jobRows)if(!jobByVersion.has(job.version_id))jobByVersion.set(job.version_id,job.state==='processing'&&Number(job.lease_until)<Date.now()?'failed':job.state)
  const pendingVersionIds:string[]=[]
  let processing=0,failed=0
  for(const row of pending){
    const state=jobByVersion.get(row.item.image.id)
    if(state==='processing'){processing++;exclusions.analysis_processing++}
    else if(state==='failed'){failed++;exclusions.analysis_failed++}
    else if(state==='succeeded')exclusions.invalid_observations++
    else{pendingVersionIds.push(row.item.image.id);exclusions.observations++}
  }
  const ready=sourced.filter(row=>row.context)
  const activeIds=ready.map(row=>row.item.image.id)
  const culturalPack=env.CULTURAL_INTELLIGENCE_V3_ENABLED==='true'?await stage('cultural',()=>loadApprovedCulturalEvidence(bucket,activeIds).catch(()=>null)):null
  const cultural=culturalPack?await stage('cultural',async()=>culturalSourcesForEditorial(culturalPack,activeIds)):[]
  return {items:ready.map(row=>row.item),visualContexts:ready.map(row=>row.context!),sources:[...allSources.filter(source=>activeIds.includes(source.assetId)),...cultural],eligibleCount:ready.length,
    preparation:{pendingVersionIds,processing,failed,exclusions,rankedCount:ranked.items.length,evaluatedCount,activeMediaCount:activeCount,publishedInPromptWindow:published.length}}
}
