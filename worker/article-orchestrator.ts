import type {EditorialPreferences} from '../shared/editorial'
import type {EditorialMode} from './editorial-model-routing'
import type {Bindings} from './index'
import {ARTICLE_CONTRACT_VERSION} from '../shared/editorial-articles'
import type {EditorialArticleEdition} from '../shared/editorial-articles'
import {articleEditorialResponse,validateArticleEdition} from './editorial-articles'
import {editorialArticlePool,reportArticlePoolFailure,type ArticlePool} from './editorial-article-pool'
import {runClassification,AssetAnalysisError} from './asset-classifier'
import {catalogDigest} from './catalog-store'
import {ARTICLE_EVIDENCE_VERSION,ARTICLE_INTERPRETATION_VERSION} from '../shared/article-evidence'
import {resolveArticlePreparationPolicy} from './article-preparation-policy'

const JOB_VERSION='curio-article-job-v1'
const LEASE_MS=120_000
const JOB_TTL_MS=7*86_400_000

type JobRow={id:string;ip_digest:string;input_digest:string;state:'preparing'|'generating'|'completed'|'failed';lease_token:string|null;lease_until:number|null;result_json:string|null;evidence_digest:string|null}
const base={format:ARTICLE_CONTRACT_VERSION,source:'deterministic' as const,retrieval:'d1' as const,cached:false,articleEdition:null}
const pendingResponse=(pool:ArticlePool,outcome:string,retryAfterMs:number)=>Response.json({...base,status:'preparing',fallbackReason:'analysis_pending',eligibleImages:pool.eligibleCount,requiredImages:15,
  preparation:{outcome,remainingCandidates:pool.preparation?.pendingVersionIds.length??0,processing:pool.preparation?.processing??0,retryAfterMs}},{status:202})
const failedResponse=(pool:ArticlePool)=>Response.json({...base,status:'insufficient_content',fallbackReason:'insufficient_content',eligibleImages:pool.eligibleCount,requiredImages:15},{status:409})
const evidenceDigest=(pool:ArticlePool,edition:EditorialArticleEdition)=>{
  const ids=new Set(edition.articles.flatMap(article=>article.images.map(image=>image.assetId)))
  return catalogDigest(JSON.stringify([ARTICLE_EVIDENCE_VERSION,ARTICLE_INTERPRETATION_VERSION,pool.items.filter(item=>ids.has(item.image.id)),pool.sources.filter(source=>ids.has(source.assetId)),pool.visualContexts.filter(context=>ids.has(context.assetId))]))
}

async function jobIdentity(request:Request,env:Bindings,p:EditorialPreferences,mode:EditorialMode){
  const ip=request.headers.get('CF-Connecting-IP')
  if(!ip||ip.length>64||!env.RATE_LIMIT_SALT||env.RATE_LIMIT_SALT.length<32)throw Error('Job identity unavailable')
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.RATE_LIMIT_SALT),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  const sign=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('')
  const inputDigest=await sign(JSON.stringify([JOB_VERSION,p,mode]))
  const ipDigest=await sign(`ip:${ip}`)
  // A same-prompt action resumes the same private job across a day boundary.
  const id=`article-job-${await sign(JSON.stringify([inputDigest,ipDigest]))}`
  return {id,ip,inputDigest,ipDigest}
}

// The orchestration is deterministic: no additional model agent. D1 leases
// serialize pollers; asset-analysis claims deduplicate exact image work.
export async function articleJobResponse(request:Request,env:Bindings,p:EditorialPreferences,mode:EditorialMode):Promise<Response>{
  if(env.EDITORIAL_ARTICLE_PREPARATION_ENABLED!=='true'||!p.consent||env.EDITORIAL_ARTICLES_ENABLED!=='true'||env.MAGAZINE_AI_ENABLED!=='true'||env.EDITORIAL_REVIEW_ENABLED!=='true'||env.EDITORIAL_PUBLIC_AI_ENABLED!=='true'||!env.CATALOG_DB||!env.MEDIA_BUCKET||!env.META_API_KEY||!env.INFERENCE_BUDGET)
    return articleEditorialResponse(request,env,p,mode)
  let policy:ReturnType<typeof resolveArticlePreparationPolicy>
  try{policy=resolveArticlePreparationPolicy(env)}catch{return Response.json({...base,status:'unavailable',fallbackReason:'configuration'},{status:503})}
  const db=env.CATALOG_DB,now=Date.now()
  let identity:Awaited<ReturnType<typeof jobIdentity>>
  try{identity=await jobIdentity(request,env,p,mode)}catch{return Response.json({...base,status:'unavailable',fallbackReason:'configuration'},{status:503})}
  const read=()=>db.prepare('SELECT * FROM article_edition_jobs WHERE id=?').bind(identity.id).first<JobRow>()
  let job:JobRow|null
  try{
    await db.prepare('DELETE FROM article_edition_jobs WHERE updated_at<?').bind(now-JOB_TTL_MS).run()
    await db.prepare(`INSERT INTO article_edition_jobs(id,ip_digest,input_digest,state,created_at,updated_at) VALUES(?,?,?,'preparing',?,?) ON CONFLICT(id) DO NOTHING`).bind(identity.id,identity.ipDigest,identity.inputDigest,now,now).run()
    job=await read()
  }catch{return Response.json({...base,status:'unavailable',fallbackReason:'job_storage_unavailable'},{status:503})}
  if(!job||job.ip_digest!==identity.ipDigest||job.input_digest!==identity.inputDigest)return Response.json({...base,status:'unavailable',fallbackReason:'job_unavailable'},{status:503})
  let pool:ArticlePool
  try{pool=await editorialArticlePool(env,p)}catch(error){
    const requestId=crypto.randomUUID()
    reportArticlePoolFailure(requestId,error)
    const failed=Response.json({...base,status:'unavailable',fallbackReason:'catalog_unavailable'},{status:503})
    failed.headers.set('X-Curio-Request-Id',requestId)
    return failed
  }
  if(job.state==='completed'&&job.result_json)try{
    const saved=JSON.parse(job.result_json) as {articleEdition:EditorialArticleEdition;generation:unknown}
    const edition=validateArticleEdition(saved.articleEdition,pool.items,pool.sources,pool.visualContexts,saved.articleEdition.articles.length)
    if(job.evidence_digest!==await evidenceDigest(pool,edition))throw Error('Evidence changed')
    return Response.json({format:ARTICLE_CONTRACT_VERSION,source:'meta',retrieval:'d1',cached:true,articleEdition:edition,items:pool.items,generation:saved.generation,
      inference:{attempted:false,reservedUnits:0,latencyMs:null,usage:null}})
  }catch{/* A changed version, source or grant invalidates the saved result. */}
  if(job.state==='completed'){
    const changed={...base,status:'unavailable',fallbackReason:'evidence_changed'}
    await db.prepare(`UPDATE article_edition_jobs SET state='failed',result_json=?,evidence_digest=NULL,updated_at=? WHERE id=? AND state='completed'`).bind(JSON.stringify({failure:{status:409,body:changed}}),Date.now(),identity.id).run()
    return Response.json(changed,{status:409})
  }
  if(job.state==='failed'){
    try{
      const saved=JSON.parse(job.result_json??'') as {failure?:{status?:unknown;body?:unknown}}
      if(saved?.failure&&typeof saved.failure.status==='number'&&saved.failure.body!==null&&typeof saved.failure.body==='object')return Response.json(saved.failure.body,{status:saved.failure.status})
    }catch{/* A preparation failure without a stored outcome stays insufficient. */}
    return failedResponse(pool)
  }
  if(job.state==='generating'&&(!job.lease_until||job.lease_until<now))return Response.json({...base,status:'fallback',fallbackReason:'generation_interrupted'},{status:503})
  if(job.lease_until&&job.lease_until>=now)return pendingResponse(pool,job.state==='generating'?'reviewing':'processing',15_000)
  const token=crypto.randomUUID()
  const claimed=await db.prepare(`UPDATE article_edition_jobs SET lease_token=?,lease_until=?,updated_at=? WHERE id=? AND (lease_until IS NULL OR lease_until<?) AND state='preparing' RETURNING id`).bind(token,now+LEASE_MS,now,identity.id,now).first()
  if(!claimed)return pendingResponse(pool,'processing',15_000)
  try{
    if(pool.eligibleCount>=15){
      await db.prepare(`UPDATE article_edition_jobs SET state='generating',updated_at=? WHERE id=? AND lease_token=?`).bind(Date.now(),identity.id,token).run()
      const result=await articleEditorialResponse(request,env,p,mode,pool)
      const payload=await result.clone().json() as {source?:string;articleEdition?:unknown;generation?:unknown}
      if(payload.source==='meta'&&payload.articleEdition){
        await db.prepare(`UPDATE article_edition_jobs SET state='completed',result_json=?,evidence_digest=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?`)
          .bind(JSON.stringify({articleEdition:payload.articleEdition,generation:payload.generation}),await evidenceDigest(pool,payload.articleEdition as EditorialArticleEdition),Date.now(),identity.id,token).run()
      }else await db.prepare(`UPDATE article_edition_jobs SET state='failed',result_json=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?`).bind(JSON.stringify({failure:{status:result.status,body:payload}}),Date.now(),identity.id,token).run()
      return result
    }
    const selected=(pool.preparation?.pendingVersionIds??[]).slice(0,Math.min(policy.concurrency,15-pool.eligibleCount))
    if(!selected.length){
      if(pool.preparation?.processing)return pendingResponse(pool,'processing',15_000)
      await db.prepare(`UPDATE article_edition_jobs SET state='failed',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?`).bind(Date.now(),identity.id,token).run()
      return failedResponse(pool)
    }
    const settled=await Promise.allSettled(selected.map(versionId=>runClassification({versionId,mode:'meta',consent:true,retryFailed:false},env,identity.ip,{articlePreparation:true})))
    const budgetPaused=settled.every(row=>row.status==='rejected'&&row.reason instanceof AssetAnalysisError&&row.reason.code==='inference_limit_reached')
    pool=await editorialArticlePool(env,p)
    if(budgetPaused)return Response.json({...base,status:'unavailable',fallbackReason:'budget',eligibleImages:pool.eligibleCount,requiredImages:15},{status:429})
    if(pool.eligibleCount<15&&!pool.preparation?.pendingVersionIds.length&&!pool.preparation?.processing){
      await db.prepare(`UPDATE article_edition_jobs SET state='failed',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?`).bind(Date.now(),identity.id,token).run()
      return failedResponse(pool)
    }
    return pendingResponse(pool,pool.eligibleCount>=15?'evidence_ready':'processing',pool.eligibleCount>=15?0:policy.windowSeconds*1000)
  }catch{
    await db.prepare(`UPDATE article_edition_jobs SET state='failed',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?`).bind(Date.now(),identity.id,token).run().catch(()=>{})
    return Response.json({...base,status:'fallback',fallbackReason:'job_unavailable'},{status:503})
  }finally{
    await db.prepare(`UPDATE article_edition_jobs SET lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=? AND state='preparing'`).bind(Date.now(),identity.id,token).run().catch(()=>{})
  }
}
