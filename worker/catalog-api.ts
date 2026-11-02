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
import {validateCulturalEvidence} from '../shared/cultural-evidence'
import {reserveInference} from './inference-budget'
import {CatalogPublications} from './catalog-publications'
import type {Bindings} from './index'
import {resolveR2MediaPermit} from './media-ai-adapter'
import {editorialPool} from './editorial'
import {resolveEditorialInput} from '../shared/editorial-intent'

export type CatalogBindings = { CATALOG_DB?: D1Database; CATALOG_OPERATOR_ENABLED?: string; CATALOG_OPERATOR_TOKEN?: string; PUBLIC_APP_ORIGIN?: string; ASSET_AI_ENABLED?: string; CULTURAL_INTELLIGENCE_V3_ENABLED?:string; RESEARCH_SOURCE_ORIGINS?:string; META_API_KEY?:string; META_SPARK_MODEL?:string; INFERENCE_BUDGET?:DurableObjectNamespace; RATE_LIMIT_SALT?:string; MEDIA_BUCKET?:R2Bucket }
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
catalogApi.post('/cultural/plan',async c=>{
  if(c.env.CULTURAL_INTELLIGENCE_V3_ENABLED!=='true'||!c.env.META_API_KEY||c.env.META_SPARK_MODEL!=='muse-spark-1.3')return c.json({status:'disabled'},503)
  const raw=z.strictObject({consent:z.literal(true),prompt:z.string().trim().min(3).max(500),assetVersionIds:z.array(z.string().regex(/^version-[a-f0-9]{64}$/)).min(1).max(6)}).parse(await body(c.req.raw))
  const ip=c.req.header('CF-Connecting-IP')!
  try{
    const preferences=resolveEditorialInput({prompt:raw.prompt,consent:true})
    const pool=await editorialPool(c.env as Bindings,preferences,raw.assetVersionIds,true,false)
    if(pool.retrieval!=='d1'||pool.items.length!==raw.assetVersionIds.length||raw.assetVersionIds.some(id=>!pool.items.some(item=>item.image.id===id)))return c.json({error:'Cultural planning assets unavailable.'},409)
    const input=culturalPlannerInput.parse({interest:raw.prompt,assetVersionIds:raw.assetVersionIds,ownerFacts:pool.sources.slice(0,24).map(source=>({id:source.id,assetId:source.assetId,value:source.value})),observations:pool.visualContexts.slice(0,12).map(context=>({assetId:context.assetId,text:JSON.stringify(context.observations)})),existingEvidence:[]})
    return c.json({plan:await planCulturalResearch(input,c.env.META_API_KEY,async()=>Boolean((await reserveInference(c.env as Bindings,ip,1)).allowed))})
  }
  catch{return c.json({error:'Cultural planning unavailable or budget exhausted.'},503)}
})
catalogApi.post('/cultural/retrieve',async c=>{
  if(c.env.CULTURAL_INTELLIGENCE_V3_ENABLED!=='true'||!c.env.RESEARCH_SOURCE_ORIGINS||!c.env.MEDIA_BUCKET)return c.json({status:'disabled'},503)
  try{return c.json(await researchPublicSources(await body(c.req.raw),c.env.RESEARCH_SOURCE_ORIGINS,{onPassage:async proof=>{await c.env.MEDIA_BUCKET!.put(passageProofKey(proof.id),JSON.stringify(proof),{httpMetadata:{contentType:'application/json'}})}}))}
  catch{return c.json({error:'Cultural retrieval unavailable.'},422)}
})
catalogApi.post('/cultural/packs',async c=>{
  if(c.env.CULTURAL_INTELLIGENCE_V3_ENABLED!=='true'||!c.env.MEDIA_BUCKET)return c.json({status:'disabled'},503)
  try{
    const raw:unknown=await body(c.req.raw)
    const ids=z.object({assetVersionIds:z.array(z.string().regex(/^version-[a-f0-9]{64}$/)).min(1).max(6)}).parse(raw).assetVersionIds
    const publication=await new CatalogPublications(c.env.CATALOG_DB!).list('',6,ids)
    if(publication.items.length!==ids.length||ids.some(id=>!publication.items.some(item=>item.image.id===id&&item.permissions.aiAnalysis.status==='approved'&&item.permissions.aiAnalysis.evidence)))return c.json({error:'Cultural asset publication unavailable.'},409)
    const available=await Promise.all(ids.map(async id=>{const permit=await resolveR2MediaPermit(c.env.CATALOG_DB!,id);if(!permit)return false;const head=await c.env.MEDIA_BUCKET!.head(permit.r2Key);return head?.size===permit.byteSize&&head.customMetadata?.sha256===permit.sha256&&head.customMetadata?.versionId===id}))
    if(available.some(value=>!value))return c.json({error:'Cultural asset media unavailable.'},409)
    const pack=validateCulturalEvidence(raw,ids)
    if(pack.status!=='approved')return c.json({error:'Cultural evidence requires operator review.'},409)
    if(!await verifyCapturedPassages(c.env.MEDIA_BUCKET,pack))return c.json({error:'Cultural passage proof unavailable.'},409)
    const key=await culturalEvidenceKey(ids),bytes=JSON.stringify(pack)
    if(new TextEncoder().encode(bytes).length>65536)return c.json({error:'Cultural pack exceeds bound.'},413)
    await c.env.MEDIA_BUCKET.put(key,bytes,{httpMetadata:{contentType:'application/json'},customMetadata:{version:pack.version,packId:pack.id}})
    return c.json({stored:true,packId:pack.id,assetVersionIds:ids},201)
  }catch{return c.json({error:'Cultural evidence invalid or unavailable.'},422)}
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
