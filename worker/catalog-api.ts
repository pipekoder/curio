import { Hono } from 'hono'
import { timingSafeEqual } from 'hono/utils/buffer'
import { z } from 'zod'
import { boundedText } from './meta'
import { queryRequest } from './catalog-contracts'
import { CatalogConflict, D1Catalog } from './catalog-store'
import { assetApi } from './asset-api'
import { allowedOperatorOrigin } from './operator-origin'
import {SamObjectStore} from './sam-object-store'
import {researchPublicSources} from './cultural-research'
import {culturalPlannerInput,planCulturalResearch} from './cultural-planner'
import {culturalEvidenceKey,passageProofKey,verifyCapturedPassages} from './cultural-evidence-store'
import {culturalEvidencePack,validateCulturalEvidence} from '../shared/cultural-evidence'
import {finishInference,reserveInference} from './inference-budget'
import {CatalogPublications} from './catalog-publications'
import type {Bindings} from './index'
import {resolveR2MediaPermit} from './media-ai-adapter'
import {editorialPool} from './editorial'
import {resolveEditorialInput} from '../shared/editorial-intent'
import {rankLexicalSources} from './cultural-ranking'
import {museRelationshipCandidates,relationshipsForTopic} from './cultural-graph'
import {loadApprovedCulturalEvidence} from './cultural-evidence-store'
import {adaptiveInput,executeAdaptiveResearch} from './cultural-adaptive'
import {culturalSourcesForLongform} from './cultural-evidence-store'
import {advanceLongform,LongformJobStore,longformInput,type LongformJob} from './longform-editorial'
import {longformMuseModel} from './longform-muse'
import {loadEditorialSources} from './editorial-sources'

export type CatalogBindings = { CATALOG_DB?: D1Database; CATALOG_OPERATOR_ENABLED?: string; CATALOG_OPERATOR_TOKEN?: string; PUBLIC_APP_ORIGIN?: string; ASSET_AI_ENABLED?: string; CULTURAL_INTELLIGENCE_V3_ENABLED?:string; CULTURAL_RESEARCH_PLANNER_ENABLED?:string; CULTURAL_RELATIONSHIP_AI_ENABLED?:string; CULTURAL_LONGFORM_ENABLED?:string; RESEARCH_SOURCE_ORIGINS?:string; META_API_KEY?:string; META_SPARK_MODEL?:string; INFERENCE_BUDGET?:DurableObjectNamespace; RATE_LIMIT_SALT?:string; MEDIA_BUCKET?:R2Bucket }
export const catalogApi = new Hono<{ Bindings: CatalogBindings }>()
catalogApi.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  const env = c.env ?? {}, token = env.CATALOG_OPERATOR_TOKEN, auth = c.req.header('Authorization') ?? ''
  if (env.CATALOG_OPERATOR_ENABLED !== 'true' || !env.CATALOG_DB || !token || token.length < 32 || !env.PUBLIC_APP_ORIGIN) return c.json({ status: 'catalog_unavailable' }, 503)
  if (auth.length > 512 || !await timingSafeEqual(auth, `Bearer ${token}`) || !allowedOperatorOrigin(c.req.raw,env.PUBLIC_APP_ORIGIN) || !c.req.header('CF-Connecting-IP') || c.req.header('CF-Connecting-IP')!.length > 64) return c.json({ error: 'Operator access required.' }, 403)
  if (c.req.method !== 'GET' && c.req.header('Content-Type')?.split(';')[0].toLowerCase() !== 'application/json') return c.json({ error: 'JSON required.' }, 415)
  await next()
})
const body = async (request: Request) => {
  let text: string
  try { text = await boundedText(request.body, 65536) } catch { throw new RangeError('Body exceeds 64 KiB.') }
  return JSON.parse(text) as unknown
}
catalogApi.onError((error, c) => {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: 'Invalid catalog request.' }, 400)
  if (error instanceof RangeError) return c.json({ error: 'Body exceeds 64 KiB.' }, 413)
  if (error instanceof CatalogConflict) return c.json({ error: error.message }, 409)
  // Do not expose SQL, URLs, raw imported metadata or operator credentials.
  return c.json({ error: 'Catalog operation unavailable.' }, 503)
})
catalogApi.get('/status', c => new D1Catalog(c.env.CATALOG_DB!).status().then(value => c.json(value)))
catalogApi.route('/intelligence', assetApi)
catalogApi.get('/sources', c => new D1Catalog(c.env.CATALOG_DB!).listSources().then(value => c.json({ sources: value })))
catalogApi.get('/sources/:id/facts', async c => c.json({ facts: await new D1Catalog(c.env.CATALOG_DB!).sourceFacts(c.req.param('id')) }))
async function operatorPlannerContext(env:CatalogBindings,prompt:string,ids:string[]){
  const preferences=resolveEditorialInput({prompt,consent:true})
  const pool=await editorialPool(env as Bindings,preferences,ids,true,false)
  if(pool.retrieval!=='d1'||pool.items.length!==ids.length||ids.some(id=>!pool.items.some(item=>item.image.id===id)))throw Error('Cultural planning assets unavailable')
  return culturalPlannerInput.parse({interest:prompt,assetVersionIds:ids,ownerFacts:pool.sources.slice(0,24).map(source=>({id:source.id,assetId:source.assetId,value:source.value.slice(0,1000)})),observations:pool.visualContexts.slice(0,12).map(context=>({assetId:context.assetId,text:JSON.stringify(context.observations).slice(0,1000)})),existingEvidence:[]})
}
catalogApi.post('/cultural/plan',async c=>{
  if(c.env.CULTURAL_INTELLIGENCE_V3_ENABLED!=='true'||c.env.CULTURAL_RESEARCH_PLANNER_ENABLED!=='true'||!c.env.META_API_KEY||c.env.META_SPARK_MODEL!=='muse-spark-1.3')return c.json({status:'disabled'},503)
  const raw=z.strictObject({consent:z.literal(true),prompt:z.string().trim().min(3).max(500),assetVersionIds:z.array(z.string().regex(/^version-[a-f0-9]{64}$/)).min(1).max(6)}).parse(await body(c.req.raw))
  const ip=c.req.header('CF-Connecting-IP')!
  try{
    const input=await operatorPlannerContext(c.env,raw.prompt,raw.assetVersionIds)
    return c.json({plan:await planCulturalResearch(input,c.env.META_API_KEY,async()=>Boolean((await reserveInference(c.env as Bindings,ip,1)).allowed))})
  }
  catch{return c.json({error:'Cultural planning unavailable or budget exhausted.'},503)}
})
catalogApi.post('/cultural/research',async c=>{
  if(c.env.CULTURAL_INTELLIGENCE_V3_ENABLED!=='true'||c.env.CULTURAL_RESEARCH_PLANNER_ENABLED!=='true'||!c.env.META_API_KEY||c.env.META_SPARK_MODEL!=='muse-spark-1.3'||!c.env.MEDIA_BUCKET||!c.env.RESEARCH_SOURCE_ORIGINS)return c.json({status:'disabled'},503)
  try{
    const input=adaptiveInput.parse(await body(c.req.raw))
    const publication=await new CatalogPublications(c.env.CATALOG_DB!).list('',6,input.assetVersionIds)
    if(publication.items.length!==input.assetVersionIds.length||input.assetVersionIds.some(id=>!publication.items.some(item=>item.image.id===id&&item.permissions.aiAnalysis.status==='approved')))return c.json({error:'Cultural assets unavailable.'},409)
    const existing=await loadApprovedCulturalEvidence(c.env.MEDIA_BUCKET,input.assetVersionIds)
    if(existing)return c.json({status:'existing_sufficient',packId:existing.id,modelCalls:0,retrievalRounds:0})
    const context=await operatorPlannerContext(c.env,input.prompt,input.assetVersionIds),ip=c.req.header('CF-Connecting-IP')!
    const result=await executeAdaptiveResearch(input,{
      plan:()=>planCulturalResearch(context,c.env.META_API_KEY!,async()=>Boolean((await reserveInference(c.env as Bindings,ip,1)).allowed)),
      retrieve:async(query,urls)=>(await researchPublicSources({query,urls},c.env.RESEARCH_SOURCE_ORIGINS!,{onPassage:async proof=>{await c.env.MEDIA_BUCKET!.put(passageProofKey(proof.id),JSON.stringify(proof),{httpMetadata:{contentType:'application/json'}})}})).sources,
      rank:async(query,sources)=>rankLexicalSources(query,sources,0.5),
    })
    return c.json({...result,modelCalls:1,approval:'operator_review_required'})
  }catch{return c.json({error:'Cultural research unavailable or budget exhausted.'},503)}
})
catalogApi.post('/cultural/retrieve',async c=>{
  if(c.env.CULTURAL_INTELLIGENCE_V3_ENABLED!=='true'||!c.env.RESEARCH_SOURCE_ORIGINS||!c.env.MEDIA_BUCKET)return c.json({status:'disabled'},503)
  try{
    const input=z.strictObject({consent:z.literal(true),query:z.string().trim().min(3).max(160),urls:z.array(z.url().max(2048)).min(1).max(3),quote:z.string().trim().min(3).max(200).optional()}).parse(await body(c.req.raw))
    const {consent:_,...query}=input;void _
    const result=await researchPublicSources(query,c.env.RESEARCH_SOURCE_ORIGINS,{onPassage:async proof=>{await c.env.MEDIA_BUCKET!.put(passageProofKey(proof.id),JSON.stringify(proof),{httpMetadata:{contentType:'application/json'}})}})
    const ranking=rankLexicalSources(query.query,result.sources,0.5)
    return c.json({...result,ranking})
  }
  catch{return c.json({error:'Cultural retrieval unavailable.'},422)}
})
catalogApi.post('/cultural/packs',async c=>{
  if(c.env.CULTURAL_INTELLIGENCE_V3_ENABLED!=='true'||!c.env.MEDIA_BUCKET)return c.json({status:'disabled'},503)
  try{
    const request=z.strictObject({pack:culturalEvidencePack,expectedRevision:z.number().int().min(0)}).parse(await body(c.req.raw))
    const ids=request.pack.assetVersionIds
    const publication=await new CatalogPublications(c.env.CATALOG_DB!).list('',6,ids)
    if(publication.items.length!==ids.length||ids.some(id=>!publication.items.some(item=>item.image.id===id&&item.permissions.aiAnalysis.status==='approved'&&item.permissions.aiAnalysis.evidence)))return c.json({error:'Cultural asset publication unavailable.'},409)
    const available=await Promise.all(ids.map(async id=>{const permit=await resolveR2MediaPermit(c.env.CATALOG_DB!,id);if(!permit)return false;const head=await c.env.MEDIA_BUCKET!.head(permit.r2Key);return head?.size===permit.byteSize&&head.customMetadata?.sha256===permit.sha256&&head.customMetadata?.versionId===id}))
    if(available.some(value=>!value))return c.json({error:'Cultural asset media unavailable.'},409)
    if(request.pack.status!=='candidate')return c.json({error:'Cultural evidence requires operator review.'},409)
    const key=await culturalEvidenceKey(ids),previous=await c.env.MEDIA_BUCKET.get(key)
    const prior=previous?validateCulturalEvidence(JSON.parse(await boundedText(previous.body,65536)),ids):null
    if((prior?.reviewRevision??0)!==request.expectedRevision)return c.json({error:'Stale cultural review revision.'},409)
    const revision=request.expectedRevision+1
    const pack=validateCulturalEvidence({...request.pack,status:'approved',reviewRevision:revision,reviewHistory:[...(prior?.reviewHistory??[]),{revision,action:'approve',at:new Date().toISOString(),actor:'catalog-operator'}]},ids)
    if(!await verifyCapturedPassages(c.env.MEDIA_BUCKET,pack))return c.json({error:'Cultural passage proof unavailable.'},409)
    const bytes=JSON.stringify(pack)
    if(new TextEncoder().encode(bytes).length>65536)return c.json({error:'Cultural pack exceeds bound.'},413)
    const stored=await c.env.MEDIA_BUCKET.put(key,bytes,{...(previous?{onlyIf:{etagMatches:previous.etag}}:{}),httpMetadata:{contentType:'application/json'},customMetadata:{version:pack.version,packId:pack.id}})
    if(!stored)return c.json({error:'Concurrent cultural review.'},409)
    return c.json({stored:true,packId:pack.id,assetVersionIds:ids,reviewRevision:revision},201)
  }catch{return c.json({error:'Cultural evidence invalid or unavailable.'},422)}
})
catalogApi.post('/cultural/packs/revoke',async c=>{
  if(c.env.CULTURAL_INTELLIGENCE_V3_ENABLED!=='true'||!c.env.MEDIA_BUCKET)return c.json({status:'disabled'},503)
  try{
    const input=z.strictObject({assetVersionIds:z.array(z.string().regex(/^version-[a-f0-9]{64}$/)).min(1).max(6),expectedRevision:z.number().int().min(1)}).parse(await body(c.req.raw))
    const key=await culturalEvidenceKey(input.assetVersionIds),previous=await c.env.MEDIA_BUCKET.get(key)
    if(!previous)return c.json({error:'Cultural pack unavailable.'},404)
    const prior=validateCulturalEvidence(JSON.parse(await boundedText(previous.body,65536)),input.assetVersionIds)
    if(prior.reviewRevision!==input.expectedRevision)return c.json({error:'Stale cultural review revision.'},409)
    const revision=input.expectedRevision+1
    const revoked=validateCulturalEvidence({...prior,status:'rejected',reviewRevision:revision,reviewHistory:[...prior.reviewHistory,{revision,action:'revoke',at:new Date().toISOString(),actor:'catalog-operator'}]},input.assetVersionIds)
    const stored=await c.env.MEDIA_BUCKET.put(key,JSON.stringify(revoked),{onlyIf:{etagMatches:previous.etag},httpMetadata:{contentType:'application/json'}})
    return stored?c.json({revoked:true,reviewRevision:revision}):c.json({error:'Concurrent cultural review.'},409)
  }catch{return c.json({error:'Cultural revocation unavailable.'},422)}
})
catalogApi.post('/cultural/relationships/candidates',async c=>{
  if(c.env.CULTURAL_INTELLIGENCE_V3_ENABLED!=='true'||c.env.CULTURAL_RELATIONSHIP_AI_ENABLED!=='true'||!c.env.MEDIA_BUCKET||!c.env.META_API_KEY||c.env.META_SPARK_MODEL!=='muse-spark-1.3')return c.json({status:'disabled'},503)
  try{
    const input=z.strictObject({consent:z.literal(true),pack:culturalEvidencePack}).parse(await body(c.req.raw))
    const publication=await new CatalogPublications(c.env.CATALOG_DB!).list('',6,input.pack.assetVersionIds)
    if(publication.items.length!==input.pack.assetVersionIds.length||input.pack.assetVersionIds.some(id=>!publication.items.some(item=>item.image.id===id&&item.permissions.aiAnalysis.status==='approved')))return c.json({error:'Cultural assets unavailable.'},409)
    if(!await verifyCapturedPassages(c.env.MEDIA_BUCKET,input.pack))return c.json({error:'Cultural passage proof unavailable.'},409)
    const result=await museRelationshipCandidates(input.pack,c.env.META_API_KEY,async()=>Boolean((await reserveInference(c.env as Bindings,c.req.header('CF-Connecting-IP')!,1)).allowed))
    return c.json(result)
  }catch{return c.json({error:'Cultural candidate extraction unavailable.'},503)}
})
catalogApi.get('/cultural/relationships',async c=>{
  if(c.env.CULTURAL_INTELLIGENCE_V3_ENABLED!=='true'||!c.env.MEDIA_BUCKET)return c.json({status:'disabled'},503)
  try{
    const ids=(c.req.query('versions')??'').split(',').filter(Boolean),topic=c.req.query('topic')??''
    const publication=await new CatalogPublications(c.env.CATALOG_DB!).list('',6,ids)
    if(publication.items.length!==ids.length)return c.json({relationships:[]})
    const pack=await loadApprovedCulturalEvidence(c.env.MEDIA_BUCKET,ids)
    return c.json({relationships:pack?relationshipsForTopic(pack,topic):[]})
  }catch{return c.json({relationships:[]})}
})
const articleId=z.string().regex(/^article-[a-f0-9]{64}$/)
const articleVersions=z.array(z.string().regex(/^version-[a-f0-9]{64}$/)).min(1).max(6).refine(ids=>new Set(ids).size===ids.length)
const sha256=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('')
async function articleEvidenceCurrent(env:CatalogBindings,job:LongformJob){
 const ids=[...new Set(job.input.sources.map(source=>source.assetVersionId).filter((value):value is string=>Boolean(value)))]
 if(!ids.length||!env.MEDIA_BUCKET)return false
 const current=await new CatalogPublications(env.CATALOG_DB!).list('',6,ids)
 if(current.items.length!==ids.length||ids.some(version=>!current.items.some(item=>item.image.id===version&&item.permissions.aiAnalysis.status==='approved')))return false
 const media=await Promise.all(ids.map(async version=>{const permit=await resolveR2MediaPermit(env.CATALOG_DB!,version);if(!permit)return false;const object=await env.MEDIA_BUCKET!.head(permit.r2Key);return object?.size===permit.byteSize&&object.customMetadata?.sha256===permit.sha256&&object.customMetadata?.versionId===version}))
 if(media.some(value=>!value))return false
 const currentFacts=await loadEditorialSources(env.CATALOG_DB!,ids)
 for(const source of job.input.sources.filter(source=>source.kind==='brand_product')){
  const fresh=currentFacts.find(row=>row.id===source.id&&row.assetId===source.assetVersionId)
  if(!fresh||`Owner-provided mockup ${fresh.kind}: ${fresh.value}`!==source.text)return false
 }
 const cultural=job.input.sources.filter(source=>source.kind==='cultural_research')
 if(cultural.length){const pack=await loadApprovedCulturalEvidence(env.MEDIA_BUCKET,ids);if(!pack||cultural.some(source=>!pack.claims.some(claim=>claim.id===source.id&&claim.text===source.text&&claim.status==='reviewed')))return false}
 return true
}
catalogApi.post('/cultural/articles',async c=>{
  if(c.env.CULTURAL_INTELLIGENCE_V3_ENABLED!=='true'||c.env.CULTURAL_LONGFORM_ENABLED!=='true'||!c.env.MEDIA_BUCKET)return c.json({status:'disabled'},503)
  try{
    const input=z.strictObject({consent:z.literal(true),prompt:z.string().trim().min(3).max(500),assetVersionIds:articleVersions}).parse(await body(c.req.raw))
    const pool=await editorialPool(c.env as Bindings,resolveEditorialInput({prompt:input.prompt,consent:true}),input.assetVersionIds,true,false)
    if(pool.retrieval!=='d1'||pool.items.length!==input.assetVersionIds.length||input.assetVersionIds.some(id=>!pool.items.some(item=>item.image.id===id)))return c.json({error:'Article assets unavailable.'},409)
    if(input.assetVersionIds.some(id=>!pool.sources.some(source=>source.assetId===id)))return c.json({error:'Article evidence insufficient.'},409)
    const pack=await loadApprovedCulturalEvidence(c.env.MEDIA_BUCKET,input.assetVersionIds)
    const boundedFacts=pool.sources.filter(source=>`Owner-provided mockup ${source.kind}: ${source.value}`.length<=2000)
    if(input.assetVersionIds.some(id=>!boundedFacts.some(source=>source.assetId===id)))return c.json({error:'Article evidence insufficient.'},409)
    const selectedFacts=[...input.assetVersionIds.map(id=>boundedFacts.find(source=>source.assetId===id)!),...boundedFacts].filter((source,index,all)=>all.findIndex(row=>row.id===source.id)===index).slice(0,20)
    const facts=await Promise.all(selectedFacts.map(async source=>{const text=`Owner-provided mockup ${source.kind}: ${source.value}`;return {id:source.id,kind:'brand_product' as const,assetVersionId:source.assetId,text,verified:true as const,rightsApproved:true as const,digest:await sha256(text)}}))
    const sources=[...facts,...(pack?culturalSourcesForLongform(pack,input.assetVersionIds):[])].slice(0,24)
    const parsed=longformInput.safeParse({prompt:input.prompt,voice:'Editorial',knowledgeVersion:pack?.version??'editorial-v2.1',sources})
    if(!parsed.success)return c.json({error:'Article evidence insufficient.'},409)
    const job=await new LongformJobStore(c.env.CATALOG_DB!).create(parsed.data)
    return c.json({id:job.id,phase:job.state.phase,modelCalls:job.state.modelCalls,revision:job.revision},201)
  }catch{return c.json({error:'Article preparation unavailable.'},503)}
})
catalogApi.get('/cultural/articles/:id',async c=>{
  if(c.env.CULTURAL_INTELLIGENCE_V3_ENABLED!=='true'||c.env.CULTURAL_LONGFORM_ENABLED!=='true')return c.json({status:'disabled'},503)
  const id=articleId.safeParse(c.req.param('id'));if(!id.success)return c.json({error:'Invalid article ID.'},400)
  try{const job=await new LongformJobStore(c.env.CATALOG_DB!).load(id.data);return job&&await articleEvidenceCurrent(c.env,job)?c.json({id:job.id,state:job.state,revision:job.revision}):c.json({error:'Article unavailable.'},404)}catch{return c.json({error:'Article unavailable.'},503)}
})
catalogApi.post('/cultural/articles/:id/advance',async c=>{
  if(c.env.CULTURAL_INTELLIGENCE_V3_ENABLED!=='true'||c.env.CULTURAL_LONGFORM_ENABLED!=='true'||!c.env.META_API_KEY||c.env.META_SPARK_MODEL!=='muse-spark-1.3')return c.json({status:'disabled'},503)
  const id=articleId.safeParse(c.req.param('id'));if(!id.success)return c.json({error:'Invalid article ID.'},400)
  try{
    z.strictObject({consent:z.literal(true)}).parse(await body(c.req.raw))
    const store=new LongformJobStore(c.env.CATALOG_DB!),job=await store.load(id.data)
    if(!job)return c.json({error:'Article unavailable.'},404)
    if(!await articleEvidenceCurrent(c.env,job))return c.json({error:'Article evidence unavailable.'},409)
    let reservationId:string|undefined,outcome:'completed'|'fallback'|'error'='error'
    try{
      const result=await advanceLongform(store,id.data,longformMuseModel(c.env.META_API_KEY),async()=>{const reservation=await reserveInference(c.env as Bindings,c.req.header('CF-Connecting-IP')!,1);reservationId=reservation.reservationId;return reservation.allowed})
      outcome=result.state.phase==='failed'?'fallback':'completed'
      return c.json({id:result.id,state:result.state,revision:result.revision})
    }finally{if(reservationId)await finishInference(c.env as Bindings,reservationId,outcome).catch(()=>{})}
  }catch{return c.json({error:'Article step unavailable; no automatic retry.'},503)}
})
catalogApi.post('/query', async c => c.json(await new D1Catalog(c.env.CATALOG_DB!).query(queryRequest.parse(await body(c.req.raw)))))
catalogApi.get('/assets/:id', async c => {
  if (!/^asset-[a-f0-9]{64}$/.test(c.req.param('id'))) return c.json({ error: 'Invalid asset ID.' }, 400)
  const value = await new D1Catalog(c.env.CATALOG_DB!).get(c.req.param('id'))
  return value ? c.json(value) : c.json({ error: 'Not found.' }, 404)
})
catalogApi.post('/imports', async c => c.json(await new D1Catalog(c.env.CATALOG_DB!).ingest(await body(c.req.raw), 'catalog-operator'), 201))
catalogApi.patch('/versions/:id/permissions', async c => {
  if (!/^version-[a-f0-9]{64}$/.test(c.req.param('id'))) return c.json({ error: 'Invalid version ID.' }, 400)
  return c.json(await new D1Catalog(c.env.CATALOG_DB!).review(c.req.param('id'), await body(c.req.raw)))
})
catalogApi.patch('/assets/:id', async c => {
  if (!/^asset-[a-f0-9]{64}$/.test(c.req.param('id'))) return c.json({ error: 'Invalid asset ID.' }, 400)
  const input = z.strictObject({ archived: z.boolean() }).parse(await body(c.req.raw))
  await new D1Catalog(c.env.CATALOG_DB!).archive(c.req.param('id'), input.archived)
  return c.json({ archived: input.archived })
})
catalogApi.post('/annotations', async c => { await new D1Catalog(c.env.CATALOG_DB!).annotate(await body(c.req.raw)); return c.json({ stored: true }, 201) })
catalogApi.patch('/object-regions/:captureId/review',async c=>{
  try{return c.json(await new SamObjectStore(c.env.CATALOG_DB!).review(c.req.param('captureId'),await body(c.req.raw)))}
  catch(error){if(error instanceof z.ZodError||error instanceof SyntaxError)return c.json({error:'Invalid object review.'},400);return c.json({error:'Object review unavailable or stale.'},409)}
})
