import { DiscoveryStore } from './discovery-store'
import { CatalogPublications,publicationApprovals } from './catalog-publications'
import { curationCatalog } from "../shared/catalog"
import { retrievedVisualContext } from "./editorial-visual-context"
import { Hono } from 'hono'
import { z } from 'zod'
import { boundedText } from './meta'
import { D1Catalog, CatalogConflict } from './catalog-store'
import { AssetStore } from './asset-store'
import { gallerySources } from './asset-sources'
import { discoverGallery } from './gallery-ingestion'
import { D1AssetRetriever } from './asset-retrieval'
import { AssetAnalysisError, mediaReadiness, runClassification } from './asset-classifier'
import { versionId } from './asset-contracts'
import type { Bindings } from './index'
import {loadEditorialSources,parsePilotVersions} from './editorial-sources'
import {inferenceBudgetStatus} from './inference-budget'

// Mounted only behind the existing catalog operator authentication middleware.
export const assetApi = new Hono<{ Bindings: Bindings }>()
const body = async (request: Request) => {
  let text: string
  try { text = await boundedText(request.body,65536) } catch { throw new RangeError('Body exceeds 64 KiB.') }
  return JSON.parse(text) as unknown
}
assetApi.onError((error,c) => {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: 'Invalid asset intelligence input.' },400)
  if (error instanceof RangeError) return c.json({ error: error.message === 'Discovery run exceeds 256,000 bytes.' ? error.message : 'Body exceeds 64 KiB.' },413)
  if (error instanceof AssetAnalysisError) return c.json({ status: error.code, ...(error.inference ? { inference: error.inference } : {}) },error.status)
  if (error instanceof CatalogConflict) return c.json({ error: error.message },409)
  return c.json({ error: 'Asset intelligence operation unavailable. Check local schema/configuration.' },503)
})
assetApi.get('/stages', async c => c.json(await new AssetStore(c.env.CATALOG_DB!).stages()))
assetApi.get('/budget/status',async c=>c.json(await inferenceBudgetStatus(c.env)))
assetApi.get('/pilot/readiness',async c=>{
  const ids=parsePilotVersions(c.env.EDITORIAL_PILOT_VERSION_IDS)
  if(!ids)return c.json({configured:false,ready:false,reason:'exactly_six_version_ids_required',assets:[]})
  const retrieval=await new D1AssetRetriever(c.env.CATALOG_DB!).retrieve({allocations:{home:34,fashion:33,travel:33},aesthetics:[],tags:[],scope:'reader',publishedOnly:true,limit:50})
  const publication=await new CatalogPublications(c.env.CATALOG_DB!).list('',50,ids)
  const approvals=publicationApprovals(publication.items)
  const sources=await loadEditorialSources(c.env.CATALOG_DB!,ids)
  const assets=ids.map(versionId=>{const hit=retrieval.items.find(item=>item.version_id===versionId),item=publication.items.find(item=>item.image.id===versionId);return{versionId,published:Boolean(item),editorialMetadata:sources.some(source=>source.assetId===versionId),imageAnalysis:Boolean(hit&&item&&retrievedVisualContext(hit,item,approvals)),editorialReady:hit?.editorial_ready===1}})
  return c.json({configured:true,ready:assets.every(asset=>asset.published&&asset.editorialMetadata&&asset.imageAnalysis&&asset.editorialReady),assets})
})
assetApi.post('/imports', async c => c.json(await new AssetStore(c.env.CATALOG_DB!).import(await body(c.req.raw)),201))
assetApi.post('/discovered', async c => {
  const r = z.strictObject({ cursor: z.string().max(2048).default(''), limit: z.number().int().min(1).max(50).default(20) }).parse(await body(c.req.raw))
  return c.json({ items: await new AssetStore(c.env.CATALOG_DB!).discoveredPage(r.cursor,r.limit) })
})
assetApi.post('/discover', async c => {
  const { sourceId } = z.strictObject({ sourceId: z.string().max(80) }).parse(await body(c.req.raw))
  const source = gallerySources.find(s => s.id === sourceId)
  if (!source) return c.json({ status: 'unknown_discovery_source' },400)
  const sourceRecord = { id: source.id, name: source.name, entryUrl: source.entryUrl, kind: 'gallery', issueUrl: 'https://github.com/pipekoder/curio/issues/5#issuecomment-6441844919' }
  await new D1Catalog(c.env.CATALOG_DB!).ingest({ schemaVersion: 1, sources: [sourceRecord], candidates: [] },'asset-intelligence-operator')
  const store = new AssetStore(c.env.CATALOG_DB!)
  let result: Awaited<ReturnType<typeof discoverGallery>>
  try { result = await discoverGallery(source) }
  catch { await store.recordSource(source.id,source.entryUrl,'failed',null,null,0); return c.json({ status: 'source_unavailable', discovered: 0, aiCalls: 0 },502) }
  await store.discovered(result.items)
  await store.recordSource(source.id,source.entryUrl,result.status,result.httpStatus,result.hash,result.items.length)
  return c.json({ status: result.status, discovered: result.items.length, imported: false, aiCalls: 0 })
})
assetApi.post('/access', async c => {
  const r = z.strictObject({ versionId }).parse(await body(c.req.raw))
  return c.json(await new AssetStore(c.env.CATALOG_DB!).checkAccess(r.versionId,fetch,c.env.ASSETS))
})
assetApi.post('/classify', async c => c.json(await runClassification(await body(c.req.raw),c.env,c.req.header('CF-Connecting-IP')!)))
assetApi.get('/versions/:id/readiness', async c => {
  const id = versionId.parse(c.req.param('id')), store = new AssetStore(c.env.CATALOG_DB!), row = await store.version(id)
  if (!row) return c.json({ error: 'Not found.' },404)
  const r2Permit=c.env.MEDIA_BUCKET?await (await import('./media-ai-adapter')).resolveR2MediaPermit(c.env.CATALOG_DB!,id):null
  const hits = await new D1AssetRetriever(c.env.CATALOG_DB!).retrieve({ allocations: { home: 34, fashion: 33, travel: 33 }, aesthetics: [], tags: [], scope: 'reader', limit: 50 })
  const hit = hits.items.find(h => h.version_id === id)
  const context = hit ? curationCatalog.flatMap(ad => { const v = retrievedVisualContext(hit,ad); return v ? [v] : [] })[0] : null
  return c.json({ imageSha256: row.sha256, samAssetId: c.env.SAM_LIVE_ASSET_ID ?? null, samCommentaryEnabled: c.env.DECODER_COMMENTARY_ENABLED === "true", editorialContextAssetId: context?.assetId ?? null, inferenceMaxCalls: c.env.MAGAZINE_MAX_CALLS ?? null, editorialEnabled: c.env.MAGAZINE_AI_ENABLED === 'true', versionId: id, analysis: r2Permit?{ready:true,blockers:[],transport:'private_r2'}:mediaReadiness(row), access: await store.access(id), jobs: await store.analysisJobs(id), liveEnabled: c.env.ASSET_AI_ENABLED === 'true' })
})
assetApi.post('/retrieve', async c => c.json(await new D1AssetRetriever(c.env.CATALOG_DB!).retrieve(await body(c.req.raw))))
assetApi.post('/reviews/identity', async c => { await new AssetStore(c.env.CATALOG_DB!).reviewIdentity(await body(c.req.raw)); return c.json({ reviewed: true }) })
assetApi.post('/reviews/reader', async c => { await new AssetStore(c.env.CATALOG_DB!).reviewReader(await body(c.req.raw)); return c.json({ reviewed: true }) })

assetApi.post('/discovery/runs',async c=>{
  let text:string
  try{text=await boundedText(c.req.raw.body,256000)}catch{throw new RangeError('Discovery run exceeds 256,000 bytes.')}
  const data=JSON.parse(text) as unknown
  return c.json(await new DiscoveryStore(c.env.CATALOG_DB!).save(data),201)
})
assetApi.get('/discovery/content',async c=>c.json({items:await new DiscoveryStore(c.env.CATALOG_DB!).list(c.req.query('cursor')??'',Number(c.req.query('limit')??20))}))
assetApi.get('/discovery/content/:id',async c=>c.json(await new DiscoveryStore(c.env.CATALOG_DB!).get(c.req.param('id'))))
assetApi.post('/discovery/reviews',async c=>c.json(await new DiscoveryStore(c.env.CATALOG_DB!).review(await body(c.req.raw))))
assetApi.post('/discovery/promote',async c=>{const r=z.strictObject({versionId:z.string().max(80)}).parse(await body(c.req.raw));return c.json(await new DiscoveryStore(c.env.CATALOG_DB!).promote(r.versionId))})
assetApi.post('/discovery/publish',async c=>c.json(await new CatalogPublications(c.env.CATALOG_DB!).publish(await body(c.req.raw))))
