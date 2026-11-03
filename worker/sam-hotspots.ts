import {z} from 'zod'
import type {ArticleEditionBody} from '../shared/editorial-articles'
import {normalizedBox} from '../shared/decoder'
import type {Bindings} from './index'
import {reserveInference} from './inference-budget'
import {resolveR2MediaPermit,readR2MediaData} from './media-ai-adapter'
import {segmentWithMeta} from './sam-client'

// Automatic Product Hotspots: cache-first SAM 3.1 localization bound to
// exact image versions and pre-verified product associations. The sweep
// runs after article validation via ctx.waitUntil, never blocking
// publication or rendering. Paid calls happen at most once per unique
// (version, fingerprint, product, prompt) key; terminal states are never
// re-run and failures are never retried automatically.
export const HOTSPOT_PROMPT_VERSION='hotspot-localize-v1'
export const HOTSPOT_MAX_JOBS_PER_SWEEP=12
export const HOTSPOT_MAX_PRODUCTS_PER_IMAGE=3
export const HOTSPOT_JOB_TIMEOUT_MS=15000
export type HotspotJobState='pending'|'processing'|'ready'|'no-match'|'failed'
export type HotspotDeps={sam:typeof segmentWithMeta;reserve:typeof reserveInference}
const defaultDeps:HotspotDeps={sam:segmentWithMeta,reserve:reserveInference}

const hotspotRegion=z.strictObject({box:normalizedBox,confidence:z.number().min(0).max(1).nullable()})
const hotspotResult=z.strictObject({regions:z.array(hotspotRegion).max(8),sentence:z.string().trim().min(1).max(400)})
export type HotspotResult=z.infer<typeof hotspotResult>

// One concise sentence derived deterministically from the catalog product
// description. No model involved; never invents product identity.
export function hotspotSentence(description:string):string|null{
  const first=description.split(/(?<=[.?!])\s+/)[0]?.trim()??''
  if(!first)return null
  const sentence=/[.?!]$/.test(first)?first:`${first}.`
  return sentence.length>400?`${sentence.slice(0,397).trimEnd()}…`:sentence
}

const jobId=async(versionId:string,sha256:string,productId:string)=>{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode([versionId,sha256,productId,HOTSPOT_PROMPT_VERSION].join('|')))
  return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')
}

// Deduplicated exact image versions across the whole locked edition,
// hero and non-hero alike, in article order.
export function collectHotspotTargets(edition:ArticleEditionBody):string[]{
  const seen=new Set<string>(),targets:string[]=[]
  for(const article of edition.articles)for(const image of article.images){
    if(seen.has(image.assetId))continue
    seen.add(image.assetId);targets.push(image.assetId)
  }
  return targets
}

type TargetProduct={id:string;name:string;description:string}
async function targetProducts(db:D1Database,versionId:string):Promise<TargetProduct[]>{
  const rows=(await db.prepare(`SELECT p.id,p.name,p.description FROM media_product_images l JOIN media_products p ON p.id=l.product_id WHERE l.version_id=? AND p.description<>'' ORDER BY CASE l.role WHEN 'primary' THEN 0 WHEN 'detail' THEN 1 ELSE 2 END,l.sort_order LIMIT ?`).bind(versionId,HOTSPOT_MAX_PRODUCTS_PER_IMAGE).all<{id:string;name:string;description:string}>()).results
  return rows
}

async function setJobState(db:D1Database,id:string,state:HotspotJobState,result:HotspotResult|null){
  await db.prepare(`UPDATE sam_hotspot_jobs SET state=?,result_json=?,updated_at=? WHERE id=?`).bind(state,result?JSON.stringify(result):null,Date.now(),id).run()
}

// Enqueue missing jobs for locked edition images. Products resolve only
// through exact version associations; images without rights, fingerprint
// or described products are skipped without a row. Idempotent.
export async function enqueueHotspotJobs(db:D1Database,versionIds:string[]):Promise<string[]>{
  const ids:string[]=[]
  for(const versionId of new Set(versionIds)){
    const permit=await resolveR2MediaPermit(db,versionId)
    if(!permit)continue
    for(const product of await targetProducts(db,versionId)){
      const id=await jobId(versionId,permit.sha256,product.id)
      const now=Date.now()
      await db.prepare(`INSERT OR IGNORE INTO sam_hotspot_jobs(id,version_id,image_sha256,product_id,prompt_version,state,attempts,created_at,updated_at) VALUES(?,?,?,?,?,'pending',0,?,?)`).bind(id,versionId,permit.sha256,product.id,HOTSPOT_PROMPT_VERSION,now,now).run()
      ids.push(id)
      if(ids.length>=HOTSPOT_MAX_JOBS_PER_SWEEP)return ids
    }
  }
  return ids
}

export type HotspotRunOutcome='ready'|'no-match'|'failed'|'skipped'
// Execute one job: atomic claim, eligibility recheck, one bounded SAM
// call, deterministic validation, durable terminal state. Anything
// already claimed, terminal, stale or unpermitted ends without inference.
export async function runHotspotJob(env:Bindings,jobIdValue:string,deps:Partial<HotspotDeps>={}):Promise<HotspotRunOutcome>{
  const {sam,reserve}={...defaultDeps,...deps}
  const db=env.CATALOG_DB!
  const now=Date.now()
  const claim=await db.prepare(`UPDATE sam_hotspot_jobs SET state='processing',attempts=attempts+1,updated_at=? WHERE id=? AND state='pending'`).bind(now,jobIdValue).run()
  if(claim.meta.changes!==1)return 'skipped'
  const fail=async()=>{await setJobState(db,jobIdValue,'failed',null);return 'failed' as const}
  try{
    const job=await db.prepare(`SELECT version_id,image_sha256,product_id FROM sam_hotspot_jobs WHERE id=?`).bind(jobIdValue).first<{version_id:string;image_sha256:string;product_id:string}>()
    if(!job)return 'skipped'
    const permit=await resolveR2MediaPermit(db,job.version_id)
    if(!permit||permit.sha256!==job.image_sha256)return await fail()
    const product=await db.prepare(`SELECT p.name,p.description FROM media_products p JOIN media_product_images l ON l.product_id=p.id WHERE p.id=? AND l.version_id=? AND p.description<>''`).bind(job.product_id,job.version_id).first<{name:string;description:string}>()
    if(!product)return await fail()
    const sentence=hotspotSentence(product.description)
    if(!sentence)return await fail()
    if(!env.META_API_KEY)return await fail()
    try{
      const budget=await reserve(env,`hotspot:${job.version_id}`,1,job.version_id)
      if(!budget.allowed)return await fail()
    }catch{return await fail()}
    const signal=AbortSignal.timeout(HOTSPOT_JOB_TIMEOUT_MS)
    const imageDataUrl=await readR2MediaData(env.MEDIA_BUCKET!,permit,signal)
    // The SAM client binds results to the supplied item identity and
    // dimensions; the detail slot carries the target product because
    // automatic hotspots localize catalog products, not editorial details.
    // Geometry is re-validated below and region detail IDs are discarded.
    const ad={id:permit.assetId,image:{id:job.version_id,width:permit.width,height:permit.height},discoverableObjects:[{id:job.product_id}]} as never
    const segmentation=await sam({ad,detailId:job.product_id,concept:product.name,imageDataUrl},env.META_API_KEY,signal)
    if(segmentation.assetId!==job.version_id||segmentation.width!==permit.width||segmentation.height!==permit.height)return await fail()
    const regions:{box:z.infer<typeof normalizedBox>;confidence:number|null}[]=[]
    for(const region of segmentation.regions.slice(0,8)){
      const box=normalizedBox.safeParse(region.box)
      if(!box.success||box.data.width<0.005||box.data.height<0.005)continue
      regions.push({box:box.data,confidence:region.confidence})
    }
    if(!regions.length){await setJobState(db,jobIdValue,'no-match',null);return 'no-match'}
    await setJobState(db,jobIdValue,'ready',{regions,sentence})
    return 'ready'
  }catch{
    return await fail()
  }
}

// Post-validation sweep entry: resolve, enqueue, then execute bounded
// jobs sequentially. Safe to call repeatedly; valid cache is reused.
export async function runHotspotSweep(env:Bindings,versionIds:string[],deps:Partial<HotspotDeps>={}):Promise<HotspotRunOutcome[]>{
  if(!env.CATALOG_DB||!env.MEDIA_BUCKET||!env.META_API_KEY)return []
  const ids=await enqueueHotspotJobs(env.CATALOG_DB,versionIds)
  const outcomes:HotspotRunOutcome[]=[]
  for(const id of ids){
    const row=await env.CATALOG_DB.prepare(`SELECT state FROM sam_hotspot_jobs WHERE id=?`).bind(id).first<{state:HotspotJobState}>()
    if(row&&row.state!=='pending'){outcomes.push(row.state==='ready'?'ready':row.state==='no-match'?'no-match':row.state==='failed'?'failed':'skipped');continue}
    outcomes.push(await runHotspotJob(env,id,deps))
  }
  return outcomes
}
