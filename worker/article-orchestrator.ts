import type {EditorialPreferences} from '../shared/editorial'
import type {EditorialMode} from './editorial-model-routing'
import type {Bindings} from './index'
import {ARTICLE_CONTRACT_VERSION,ARTICLE_MIN_ELIGIBLE_IMAGES,ARTICLE_SINGLE_CONTRACT_VERSION,ARTICLE_SINGLE_MIN_ELIGIBLE_IMAGES} from '../shared/editorial-articles'
import type {ArticleEditionBody} from '../shared/editorial-articles'
import {articleEditorialResponse,researchReferencesCurrent,validateArticleEdition,validateReview,type ArticleAssessment,type ArticleGenerationStage,type ArticleJobContext,type AdoptedCheckpoint,type CheckpointInvocation} from './editorial-articles'
import {editorialTierLabel} from '../shared/editorial-tiers'
import {editorialArticlePool,reportArticlePoolFailure,type ArticlePool} from './editorial-article-pool'
import {runClassification,AssetAnalysisError} from './asset-classifier'
import {catalogDigest} from './catalog-store'
import {ARTICLE_EVIDENCE_VERSION,ARTICLE_INTERPRETATION_VERSION} from '../shared/article-evidence'
import {resolveArticlePreparationPolicy} from './article-preparation-policy'
import {publicBudgetDenial} from '../shared/budget-diagnostic'
import {editorialSources,type EditorialSource} from '../shared/editorial-sources'
import {modelCallEvents,jobNotices,type ModelCallEvent,type JobNotice} from '../shared/article-model-calls'
import {articleCheckpoint,CHECKPOINT_WORKFLOW_VERSION,type CheckpointStage,type CheckpointPayload} from '../shared/article-checkpoints'
import {editorialReviewOutput} from '../shared/editorial-standard'
import {ARTICLE_JOB_MAX_INVOCATIONS} from './inference-budget'
import {ARTICLE_3STORY_LEASE_MS} from './article-provider-timeout'
import {approvedArticleVersions} from './editorial-revisions'

const JOB_VERSION='curio-article-job-demo-v2'
// Exceeds the bounded 150-second editorial workflow plus catalog and D1 work.
// A generating lease is never reclaimed for inference after expiry.
const LEASE_MS=200_000
const JOB_TTL_MS=7*86_400_000

type JobRow={id:string;ip_digest:string;input_digest:string;state:'preparing'|'generating'|'completed'|'failed';lease_token:string|null;lease_until:number|null;result_json:string|null;evidence_digest:string|null}
type ArticleLimits={format:string;minEligible:number}
const limitsFor=(articleCount:1|3):ArticleLimits=>articleCount===1
  ?{format:ARTICLE_SINGLE_CONTRACT_VERSION,minEligible:ARTICLE_SINGLE_MIN_ELIGIBLE_IMAGES}
  :{format:ARTICLE_CONTRACT_VERSION,minEligible:ARTICLE_MIN_ELIGIBLE_IMAGES}
type Progress={eligibleImages:number;remainingCandidates:number;processing:number}
const emptyProgress:Progress={eligibleImages:0,remainingCandidates:0,processing:0}
const progressFromPool=(pool:ArticlePool):Progress=>({eligibleImages:pool.eligibleCount,remainingCandidates:pool.preparation?.pendingVersionIds.length??0,processing:pool.preparation?.processing??0})
const storedProgress=(job:JobRow):Progress=>{
  try{
    const value=(JSON.parse(job.result_json??'{}') as {progress?:Progress}).progress
    if(value&&Number.isInteger(value.eligibleImages)&&Number.isInteger(value.remainingCandidates)&&Number.isInteger(value.processing))return value
  }catch{/* No saved progress yet. */}
  return emptyProgress
}
const pendingResponse=(base:Record<string,unknown>,requiredImages:number,progress:Progress,outcome:string,retryAfterMs:number,generationStage?:ArticleGenerationStage|null,modelCalls?:ModelCallEvent[],notices?:JobNotice[])=>Response.json({...base,status:'preparing',fallbackReason:'analysis_pending',eligibleImages:progress.eligibleImages,requiredImages,
  preparation:{outcome,remainingCandidates:progress.remainingCandidates,processing:progress.processing,retryAfterMs},...(generationStage?{generationStage}:{}),...(modelCalls?.length?{modelCalls}:{}),...(notices?.length?{notices}:{})},{status:202})
const storedStage=(job:JobRow):ArticleGenerationStage|null=>{
  try{
    const value=(JSON.parse(job.result_json??'{}') as {stage?:unknown}).stage
    if(value==='evidence'||value==='planning'||value==='research'||value==='chief_editor'||value==='reviewer'||value==='revision'||value==='confirmation')return value
  }catch{/* No reported stage yet. */}
  return null
}
// Backend-observed invocation log written by the lease owner: malformed or
// absent entries read as no calls, never as fabricated ones.
const storedModelCalls=(job:JobRow):ModelCallEvent[]=>{
  try{
    const parsed=modelCallEvents.safeParse((JSON.parse(job.result_json??'{}') as {modelCalls?:unknown}).modelCalls)
    if(parsed.success)return parsed.data
  }catch{/* No reported invocations yet. */}
  return []
}
const storedNotices=(job:JobRow):JobNotice[]=>{
  try{
    const parsed=jobNotices.safeParse((JSON.parse(job.result_json??'{}') as {notices?:unknown}).notices)
    if(parsed.success)return parsed.data
  }catch{/* No reported notices yet. */}
  return []
}
type JobSpend={attempts:number;charged:number}
const storedSpend=(job:JobRow):JobSpend|null=>{
  try{
    const value=(JSON.parse(job.result_json??'{}') as {spend?:unknown}).spend as JobSpend|null
    if(value&&Number.isInteger(value.attempts)&&value.attempts>=0&&Number.isInteger(value.charged)&&value.charged>=0)return {attempts:value.attempts,charged:value.charged}
  }catch{/* No reported spend yet. */}
  return null
}
type ResumeMeta={recoverable:boolean;failedStage:string|null;attemptsUsed:number;chargedUnits:number}
// Resume metadata from a saved failure body. Anything malformed reads as
// non-resumable: the terminal failure is re-served unchanged.
const storedResumeMeta=(job:JobRow):ResumeMeta|null=>{
  try{
    const body=(JSON.parse(job.result_json??'') as {failure?:{body?:{resume?:unknown}}}).failure?.body as {resume?:ResumeMeta}|undefined
    const meta=body?.resume
    if(meta&&meta.recoverable===true&&(meta.failedStage===null||typeof meta.failedStage==='string')&&Number.isInteger(meta.attemptsUsed)&&meta.attemptsUsed>=0&&Number.isInteger(meta.chargedUnits)&&meta.chargedUnits>=0)return {recoverable:true,failedStage:meta.failedStage,attemptsUsed:meta.attemptsUsed,chargedUnits:meta.chargedUnits}
  }catch{/* No resume metadata. */}
  return null
}
const storedResumeHistory=(job:JobRow):{modelCalls:ModelCallEvent[];notices:JobNotice[]}=>{
  try{
    const body=(JSON.parse(job.result_json??'') as {failure?:{body?:{modelCalls?:unknown;notices?:unknown}}}).failure?.body
    if(!body)return {modelCalls:[],notices:[]}
    const calls=modelCallEvents.safeParse(body.modelCalls),notices=jobNotices.safeParse(body.notices)
    return {modelCalls:calls.success?calls.data:[],notices:notices.success?notices.data:[]}
  }catch{return {modelCalls:[],notices:[]}}
}

type ResumeReset={token:string;job:JobRow;spend:JobSpend}
// Reset a resumable 3-story row to preparing under a fresh lease so the
// normal owner path rebuilds the pool and continues generation. History
// and spend carry over; checkpoints stay in their own table. Returns null
// when resume is not eligible, {lostRace:true} when another request
// claimed first (callers must serve a neutral 202, never stale state).
async function tryResumeReset(db:D1Database,job:JobRow,kind:'failed'|'interrupted',leaseMs:number,now:number):Promise<ResumeReset|{lostRace:true}|null>{
  const token=crypto.randomUUID()
  let spend:JobSpend,resultJson:string
  if(kind==='failed'){
    const meta=storedResumeMeta(job)
    if(!meta||meta.attemptsUsed>=ARTICLE_JOB_MAX_INVOCATIONS)return null
    const history=storedResumeHistory(job)
    spend={attempts:meta.attemptsUsed,charged:meta.chargedUnits}
    resultJson=JSON.stringify({...((history.modelCalls.length||history.notices.length)?{modelCalls:history.modelCalls,notices:history.notices}:{}),spend})
    const reset=await db.prepare(`UPDATE article_edition_jobs SET state='preparing',lease_token=?,lease_until=?,result_json=?,updated_at=? WHERE id=? AND state='failed' AND lease_token IS NULL RETURNING id`).bind(token,now+leaseMs,resultJson,now,job.id).first()
    if(!reset)return {lostRace:true}
  }else{
    if(job.state!=='generating')return null
    const history=storedModelCalls(job)
    spend=storedSpend(job)??{attempts:history.length,charged:4}
    if(spend.attempts>=ARTICLE_JOB_MAX_INVOCATIONS)return null
    resultJson=job.result_json??'{}'
    const reset=await db.prepare(`UPDATE article_edition_jobs SET state='preparing',lease_token=?,lease_until=?,result_json=?,updated_at=? WHERE id=? AND state='generating' AND (lease_token IS NULL OR lease_token=?) AND (lease_until IS NULL OR lease_until<?) RETURNING id`).bind(token,now+leaseMs,resultJson,now,job.id,job.lease_token,now).first()
    if(!reset)return {lostRace:true}
  }
  return {token,job:{...job,state:'preparing',lease_token:token,lease_until:now+leaseMs,result_json:resultJson},spend}
}

// Validate stored checkpoints against a fresh pool, in stage order. The
// first invalid checkpoint discards itself and every later one: later
// stages depend on earlier values. Returns the adoptable prefix.
async function loadCheckpoints(db:D1Database,jobId:string,inputDigest:string,pool:ArticlePool):Promise<AdoptedCheckpoint[]>{
  const adopted:AdoptedCheckpoint[]=[]
  let rows:{stage:unknown;checkpoint_json:unknown}[]=[]
  try{
    const found=await db.prepare('SELECT stage,checkpoint_json FROM article_edition_checkpoints WHERE job_id=?').bind(jobId).all()
    rows=(found.results as {stage:unknown;checkpoint_json:unknown}[])??[]
  }catch{return []}
  const byStage=new Map(rows.map(row=>[row.stage,row.checkpoint_json]))
  for(const stage of ['chief','review','revision','confirmation'] as CheckpointStage[]){
    try{
      const raw=byStage.get(stage)
      if(typeof raw!=='string')break
      const parsed=articleCheckpoint.parse(JSON.parse(raw))
      if(parsed.jobId!==jobId||parsed.inputDigest!==inputDigest||parsed.version!==CHECKPOINT_WORKFLOW_VERSION||parsed.stage!==stage||parsed.articleCount!==3)break
      const articles=(parsed.value.edition as {articles?:unknown})?.articles
      if(!Array.isArray(articles)||articles.length<1||articles.length>3)break
      const edition=validateArticleEdition(parsed.value.edition,pool.items,pool.sources,pool.visualContexts,articles.length)
      if(parsed.evidenceDigest!==await evidenceDigest(pool,edition,[]))break
      const entry:AdoptedCheckpoint={stage,edition}
      if(stage==='review'){
        if(parsed.value.review===undefined)break
        const review=editorialReviewOutput.parse(parsed.value.review)
        validateReview(review,edition,pool.sources)
        entry.review=review
      }
      if(stage==='confirmation'){
        if(parsed.value.confirmation===undefined)break
        const confirmation=editorialReviewOutput.parse(parsed.value.confirmation)
        validateReview(confirmation,edition,pool.sources)
        entry.confirmation=confirmation
      }
      adopted.push(entry)
    }catch{break}
  }
  return adopted
}
const failedResponse=(base:Record<string,unknown>,requiredImages:number,eligibleImages:number)=>Response.json({...base,status:'insufficient_content',fallbackReason:'insufficient_content',eligibleImages,requiredImages},{status:409})
const evidenceDigest=(pool:ArticlePool,edition:ArticleEditionBody,research:readonly EditorialSource[]=[])=>{
  const ids=new Set(edition.articles.flatMap(article=>article.images.map(image=>image.assetId)))
  return catalogDigest(JSON.stringify([ARTICLE_EVIDENCE_VERSION,ARTICLE_INTERPRETATION_VERSION,pool.items.filter(item=>ids.has(item.image.id)),pool.sources.filter(source=>ids.has(source.assetId)),pool.visualContexts.filter(context=>ids.has(context.assetId)),research]))
}

async function jobIdentity(request:Request,env:Bindings,p:EditorialPreferences,mode:EditorialMode,format:string){
  const ip=request.headers.get('CF-Connecting-IP')
  if(!ip||ip.length>64||!env.RATE_LIMIT_SALT||env.RATE_LIMIT_SALT.length<32)throw Error('Job identity unavailable')
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.RATE_LIMIT_SALT),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  const sign=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value))),byte=>byte.toString(16).padStart(2,'0')).join('')
  const inputDigest=await sign(JSON.stringify([JOB_VERSION,format,p,mode,format===ARTICLE_SINGLE_CONTRACT_VERSION&&env.EDITORIAL_WORKFLOW_V3_ENABLED==='true'?'v3':'v2']))
  const ipDigest=await sign(`ip:${ip}`)
  // A same-prompt action resumes the same private job across a day boundary.
  const id=`article-job-${await sign(JSON.stringify([inputDigest,ipDigest]))}`
  return {id,ip,inputDigest,ipDigest}
}

// The orchestration is deterministic: no additional model agent. D1 leases
// serialize pollers; asset-analysis claims deduplicate exact image work.
export async function articleJobResponse(request:Request,env:Bindings,p:EditorialPreferences,mode:EditorialMode,articleCount:1|3=3,schedule?:(task:Promise<unknown>)=>void):Promise<Response>{
  const {format,minEligible}=limitsFor(articleCount)
  const leaseMs=articleCount===3?ARTICLE_3STORY_LEASE_MS:articleCount===1&&env.EDITORIAL_WORKFLOW_V3_ENABLED==='true'?230_000:LEASE_MS
  const base={format,source:'deterministic' as const,retrieval:'d1' as const,cached:false,articleEdition:null}
  if(env.EDITORIAL_ARTICLE_PREPARATION_ENABLED!=='true'||!p.consent||env.EDITORIAL_ARTICLES_ENABLED!=='true'||env.MAGAZINE_AI_ENABLED!=='true'||env.EDITORIAL_REVIEW_ENABLED!=='true'||env.EDITORIAL_PUBLIC_AI_ENABLED!=='true'||!env.CATALOG_DB||!env.MEDIA_BUCKET||!env.META_API_KEY||!env.INFERENCE_BUDGET)
    return articleEditorialResponse(request,env,p,mode,undefined,articleCount,undefined,schedule)
  let policy:ReturnType<typeof resolveArticlePreparationPolicy>
  try{policy=resolveArticlePreparationPolicy(env)}catch{return Response.json({...base,status:'unavailable',fallbackReason:'configuration'},{status:503})}
  const db=env.CATALOG_DB,now=Date.now()
  let identity:Awaited<ReturnType<typeof jobIdentity>>
  try{identity=await jobIdentity(request,env,p,mode,format)}catch{return Response.json({...base,status:'unavailable',fallbackReason:'configuration'},{status:503})}
  const read=()=>db.prepare('SELECT * FROM article_edition_jobs WHERE id=?').bind(identity.id).first<JobRow>()
  let job:JobRow|null
  try{
    job=await read()
    if(!job){
      // Expiry cleanup and insert happen once per new prompt, never on polls.
      await db.prepare(env.EDITORIAL_FEEDBACK_ENABLED==='true'
        ?'DELETE FROM article_edition_jobs WHERE updated_at<? AND NOT EXISTS(SELECT 1 FROM editorial_article_feedback f WHERE f.job_id=article_edition_jobs.id)'
        :'DELETE FROM article_edition_jobs WHERE updated_at<?').bind(now-JOB_TTL_MS).run()
      try{await db.prepare('DELETE FROM article_edition_checkpoints WHERE job_id NOT IN (SELECT id FROM article_edition_jobs)').run()}catch{/* Best effort: a missing table pre-migration must not block new jobs. */}
      await db.prepare(`INSERT INTO article_edition_jobs(id,ip_digest,input_digest,state,created_at,updated_at) VALUES(?,?,?,'preparing',?,?) ON CONFLICT(id) DO NOTHING`).bind(identity.id,identity.ipDigest,identity.inputDigest,now,now).run()
      job=await read()
    }
  }catch{return Response.json({...base,status:'unavailable',fallbackReason:'job_storage_unavailable'},{status:503})}
  if(!job||job.ip_digest!==identity.ipDigest||job.input_digest!==identity.inputDigest)return Response.json({...base,status:'unavailable',fallbackReason:'job_unavailable'},{status:503})
  let pool:ArticlePool|null=null
  if(job.state==='completed')try{pool=await editorialArticlePool(env,p)}catch(error){
    const requestId=crypto.randomUUID()
    reportArticlePoolFailure(requestId,error)
    const unavailable=Response.json({...base,status:'unavailable',fallbackReason:'catalog_unavailable'},{status:503})
    unavailable.headers.set('X-Curio-Request-Id',requestId)
    return unavailable
  }
  if(job.state==='completed'&&job.result_json)try{
    if(!pool)throw Error('Article pool unavailable')
    const saved=JSON.parse(job.result_json) as {articleEdition:ArticleEditionBody;generation:unknown;evidence?:{interpretations:number}|null;researchReferences?:unknown;aiDisclosure?:string;editorialTier?:unknown;modelCalls?:unknown;notices?:unknown}
    const research=editorialSources.parse(saved.researchReferences??[])
    if(!researchReferencesCurrent(research,env.RESEARCH_SOURCE_ORIGINS))throw Error('Research evidence expired')
    const approved=env.EDITORIAL_FEEDBACK_ENABLED==='true'?await approvedArticleVersions(db,identity.id,saved.articleEdition):{edition:saved.articleEdition,revisedIds:[]}
    const edition=validateArticleEdition(approved.edition,pool.items,[...pool.sources,...research],pool.visualContexts,saved.articleEdition.articles.length)
    if(job.evidence_digest!==await evidenceDigest(pool,edition,research))throw Error('Evidence changed')
    // Saved internal assessments are never re-served: readers receive only
    // the public tier label. Rows written before tiers omit the label.
    const tier=editorialTierLabel.safeParse(saved.editorialTier)
    const savedCalls=modelCallEvents.safeParse(saved.modelCalls)
    const reservedNotices=jobNotices.safeParse(saved.notices)
    return Response.json({format,source:'meta',retrieval:'d1',cached:true,articleEdition:edition,items:pool.items,generation:approved.revisedIds.length?{...(saved.generation as Record<string,unknown>),revisionModel:'muse-spark-1.3',confirmationModel:'muse-spark-1.3'}:saved.generation,
      ...(saved.evidence!==undefined?{evidence:saved.evidence}:{}),...(tier.success?{editorialTier:tier.data}:{}),...(savedCalls.success?{modelCalls:savedCalls.data}:{}),...(reservedNotices.success?{notices:reservedNotices.data}:{}),requestedCount:articleCount,publishedCount:edition.articles.length,partial:edition.articles.length<articleCount,...(saved.aiDisclosure?{researchReferences:research,aiDisclosure:saved.aiDisclosure}:{}),inference:{attempted:false,reservedUnits:0,latencyMs:null,usage:null}})
  }catch{/* A changed version, source or grant invalidates the saved result. */}
  if(job.state==='completed'){
    const changed={...base,status:'unavailable',fallbackReason:'evidence_changed'}
    await db.prepare(`UPDATE article_edition_jobs SET state='failed',result_json=?,evidence_digest=NULL,updated_at=? WHERE id=? AND state='completed'`).bind(JSON.stringify({failure:{status:409,body:changed}}),Date.now(),identity.id).run()
    return Response.json(changed,{status:409})
  }
  // A resumable 3-story row resets to preparing under a fresh lease and
  // flows into the normal owner path below, which rebuilds the pool and
  // continues from durable checkpoints.
  let resumed:ResumeReset|null=null
  if(job.state==='failed'&&articleCount===3){
    const reset=await tryResumeReset(db,job,'failed',leaseMs,now)
    if(reset&&'lostRace' in reset)return pendingResponse(base,minEligible,emptyProgress,'processing',15_000)
    if(reset){resumed=reset;job=reset.job}
  }
  if(job.state==='failed'){
    try{
      const saved=JSON.parse(job.result_json??'') as {failure?:{status?:unknown;body?:unknown}}
      if(saved?.failure&&typeof saved.failure.status==='number'&&saved.failure.body!==null&&typeof saved.failure.body==='object')return Response.json(saved.failure.body,{status:saved.failure.status})
    }catch{/* A preparation failure without a stored outcome stays insufficient. */}
    return failedResponse(base,minEligible,storedProgress(job).eligibleImages)
  }
  if(job.state==='generating'&&(!job.lease_until||job.lease_until<now)){
    if(articleCount===3){
      const reset=await tryResumeReset(db,job,'interrupted',leaseMs,now)
      if(reset&&'lostRace' in reset)return pendingResponse(base,minEligible,emptyProgress,'processing',15_000)
      if(reset){resumed=reset;job=reset.job}
      else return Response.json({...base,status:'fallback',fallbackReason:'generation_interrupted'},{status:503})
    }else return Response.json({...base,status:'fallback',fallbackReason:'generation_interrupted'},{status:503})
  }
  if(!resumed&&job.lease_until&&job.lease_until>=now)return pendingResponse(base,minEligible,storedProgress(job),job.state==='generating'?'reviewing':'processing',15_000,storedStage(job),storedModelCalls(job),storedNotices(job))
  const token=resumed?resumed.token:crypto.randomUUID()
  const claimed=resumed?{id:identity.id}:await db.prepare(`UPDATE article_edition_jobs SET lease_token=?,lease_until=?,updated_at=? WHERE id=? AND (lease_until IS NULL OR lease_until<?) AND state='preparing' RETURNING id`).bind(token,now+leaseMs,now,identity.id,now).first()
  if(!claimed)return pendingResponse(base,minEligible,storedProgress(job),'processing',15_000,undefined,storedModelCalls(job),storedNotices(job))
  try{
    // Only the lease owner rebuilds the pool. Waiting pollers read the job row.
    try{pool=await editorialArticlePool(env,p)}catch(error){
      const requestId=crypto.randomUUID()
      reportArticlePoolFailure(requestId,error)
      const failed=Response.json({...base,status:'unavailable',fallbackReason:'catalog_unavailable'},{status:503})
      failed.headers.set('X-Curio-Request-Id',requestId)
      return failed
    }
    if(!pool)throw Error('Article pool unavailable')
    const progress=progressFromPool(pool)
    // A resumed row keeps its invocation history and spend across the
    // rewrite; fresh rows store progress alone, exactly as before.
    const carriedCalls=storedModelCalls(job),carriedNotices=storedNotices(job),carriedSpend=resumed?resumed.spend:storedSpend(job)
    const progressJson=JSON.stringify({progress,...(carriedCalls.length?{modelCalls:carriedCalls}:{}),...(carriedNotices.length?{notices:carriedNotices}:{}),...(carriedSpend?{spend:carriedSpend}:{})})
    await db.prepare(`UPDATE article_edition_jobs SET result_json=? WHERE id=? AND lease_token=? AND state='preparing' AND (result_json IS NULL OR result_json<>?)`)
      .bind(progressJson,identity.id,token,progressJson).run()
    if(pool.eligibleCount>=minEligible){
      // The conditional D1 update is atomic across Worker isolates. Existing
      // jobs remain readable when the two-generation ceiling is reached.
      const generationNow=Date.now()
      const generationClaim=await db.prepare(`UPDATE article_edition_jobs SET state='generating',lease_until=?,updated_at=? WHERE id=? AND lease_token=? AND (SELECT COUNT(*) FROM article_edition_jobs WHERE updated_at>? AND state='generating' AND lease_until>?)<2 RETURNING id`)
        .bind(generationNow+leaseMs,generationNow,identity.id,token,generationNow-leaseMs,generationNow).first()
      if(!generationClaim){
        // Release the lease so the next poll retries promptly instead of
        // stalling until expiry behind a held but unusable lease.
        await db.prepare(`UPDATE article_edition_jobs SET lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?`).bind(Date.now(),identity.id,token).run()
        return pendingResponse(base,minEligible,progress,'waiting_for_capacity',15_000,undefined,storedModelCalls(job),storedNotices(job))
      }
      const reportGenerationStage=async(stage:ArticleGenerationStage,modelCalls?:ModelCallEvent[],notices?:JobNotice[],spend?:JobSpend)=>{
        await db.prepare(`UPDATE article_edition_jobs SET result_json=?,updated_at=? WHERE id=? AND lease_token=?`).bind(JSON.stringify({progress,stage,...(modelCalls?.length?{modelCalls}:{}),...(notices?.length?{notices}:{}),...(spend?{spend}:{})}),Date.now(),identity.id,token).run()
      }
      let assessment:ArticleAssessment|null=null
      let jobContext:ArticleJobContext|undefined
      if(articleCount===3){
        const ownedPool=pool
        const adopted=resumed?await loadCheckpoints(db,identity.id,identity.inputDigest,ownedPool):[]
        const historyCalls=storedModelCalls(job),historyNotices=storedNotices(job)
        jobContext={
          jobKey:identity.id,
          ...(adopted.length?{adopted}:{}),
          ...(resumed?{attemptsUsed:resumed.spend.attempts,chargedUnits:resumed.spend.charged}:{}),
          ...((historyCalls.length||historyNotices.length)?{history:{modelCalls:historyCalls,notices:historyNotices}}:{}),
          onCheckpoint:async(stageName:CheckpointStage,payload:CheckpointPayload,invocation:CheckpointInvocation)=>{
            const checkpoint=articleCheckpoint.parse({version:CHECKPOINT_WORKFLOW_VERSION,jobId:identity.id,inputDigest:identity.inputDigest,
              evidenceDigest:await evidenceDigest(ownedPool,payload.edition as ArticleEditionBody,[]),
              stage:stageName,articleCount:3,value:payload,model:invocation.model,invocationId:invocation.invocationId,
              startedAt:invocation.startedAt,endedAt:invocation.endedAt,usage:invocation.usage})
            const written=await db.prepare(
              `INSERT INTO article_edition_checkpoints(job_id,stage,checkpoint_json,created_at,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM article_edition_jobs WHERE id=? AND lease_token=? AND state='generating') ON CONFLICT(job_id,stage) DO UPDATE SET checkpoint_json=excluded.checkpoint_json,updated_at=excluded.updated_at WHERE EXISTS(SELECT 1 FROM article_edition_jobs WHERE id=? AND lease_token=? AND state='generating')`
            ).bind(identity.id,stageName,JSON.stringify(checkpoint),Date.now(),Date.now(),identity.id,token,identity.id,token).run()
            return (written.meta?.changes??0)>0
          },
        }
      }
      const result=await articleEditorialResponse(request,env,p,mode,pool,articleCount,reportGenerationStage,schedule,recorded=>{assessment=recorded},jobContext)
      const payload=await result.clone().json() as {source?:string;articleEdition?:unknown;generation?:unknown;evidence?:{interpretations:number}|null;researchReferences?:unknown;aiDisclosure?:string;editorialTier?:unknown;modelCalls?:unknown;notices?:unknown}
      if(payload.source==='meta'&&payload.articleEdition){
        const research=editorialSources.parse(payload.researchReferences??[])
        const tier=editorialTierLabel.safeParse(payload.editorialTier)
        const calls=modelCallEvents.safeParse(payload.modelCalls)
        const savedNotices=jobNotices.safeParse(payload.notices)
        await db.prepare(`UPDATE article_edition_jobs SET state='completed',result_json=?,evidence_digest=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?`)
          .bind(JSON.stringify({articleEdition:payload.articleEdition,generation:payload.generation,evidence:payload.evidence??null,researchReferences:research,aiDisclosure:payload.aiDisclosure,...(tier.success?{editorialTier:tier.data}:{}),...(assessment?{assessment}:{}),...(calls.success?{modelCalls:calls.data}:{}),...(savedNotices.success?{notices:savedNotices.data}:{})}),await evidenceDigest(pool,payload.articleEdition as ArticleEditionBody,research),Date.now(),identity.id,token).run()
      }else await db.prepare(`UPDATE article_edition_jobs SET state='failed',result_json=?,lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?`).bind(JSON.stringify({failure:{status:result.status,body:payload}}),Date.now(),identity.id,token).run()
      return result
    }
    const selected=(pool.preparation?.pendingVersionIds??[]).slice(0,Math.min(policy.concurrency,minEligible-pool.eligibleCount))
    if(!selected.length){
      if(pool.preparation?.processing)return pendingResponse(base,minEligible,progress,'processing',15_000,undefined,storedModelCalls(job),storedNotices(job))
      await db.prepare(`UPDATE article_edition_jobs SET state='failed',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?`).bind(Date.now(),identity.id,token).run()
      return failedResponse(base,minEligible,pool.eligibleCount)
    }
    const settled=await Promise.allSettled(selected.map(versionId=>runClassification({versionId,mode:'meta',consent:true,retryFailed:false},env,identity.ip,{articlePreparation:true})))
    const budgetPaused=settled.every(row=>row.status==='rejected'&&row.reason instanceof AssetAnalysisError&&row.reason.code==='inference_limit_reached')
    if(budgetPaused){
      const denial=settled.find(row=>row.status==='rejected'&&row.reason instanceof AssetAnalysisError&&row.reason.budget)
      const body={...base,status:'unavailable',fallbackReason:'budget',...(denial?.status==='rejected'&&denial.reason instanceof AssetAnalysisError&&denial.reason.budget?{budget:publicBudgetDenial(denial.reason.budget)}:{}),eligibleImages:progress.eligibleImages,requiredImages:minEligible}
      return Response.json(body,{status:429})
    }
    pool=await editorialArticlePool(env,p)
    const nextProgress=progressFromPool(pool)
    await db.prepare(`UPDATE article_edition_jobs SET result_json=? WHERE id=? AND lease_token=? AND state='preparing' AND result_json<>?`)
      .bind(JSON.stringify({progress:nextProgress}),identity.id,token,JSON.stringify({progress:nextProgress})).run()
    if(pool.eligibleCount<minEligible&&!pool.preparation?.pendingVersionIds.length&&!pool.preparation?.processing){
      await db.prepare(`UPDATE article_edition_jobs SET state='failed',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?`).bind(Date.now(),identity.id,token).run()
      return failedResponse(base,minEligible,pool.eligibleCount)
    }
    return pendingResponse(base,minEligible,nextProgress,pool.eligibleCount>=minEligible?'evidence_ready':'processing',pool.eligibleCount>=minEligible?0:policy.windowSeconds*1000,undefined,storedModelCalls(job),storedNotices(job))
  }catch{
    await db.prepare(`UPDATE article_edition_jobs SET state='failed',lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=?`).bind(Date.now(),identity.id,token).run().catch(()=>{})
    return Response.json({...base,status:'fallback',fallbackReason:'job_unavailable'},{status:503})
  }finally{
    await db.prepare(`UPDATE article_edition_jobs SET lease_token=NULL,lease_until=NULL,updated_at=? WHERE id=? AND lease_token=? AND state='preparing'`).bind(Date.now(),identity.id,token).run().catch(()=>{})
  }
}
