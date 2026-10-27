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

// Mounted only behind the existing catalog operator authentication middleware.
export const assetApi = new Hono<{ Bindings: Bindings }>()
const body = async (request: Request) => {
  let text: string
  try { text = await boundedText(request.body,65536) } catch { throw new RangeError('Body exceeds 64 KiB.') }
  return JSON.parse(text) as unknown
}
assetApi.onError((error,c) => {
  if (error instanceof z.ZodError || error instanceof SyntaxError) return c.json({ error: 'Invalid asset intelligence input.' },400)
  if (error instanceof RangeError) return c.json({ error: 'Body exceeds 64 KiB.' },413)
  if (error instanceof AssetAnalysisError) return c.json({ status: error.code },error.status)
  if (error instanceof CatalogConflict) return c.json({ error: error.message },409)
  return c.json({ error: 'Asset intelligence operation unavailable. Check local schema/configuration.' },503)
})
assetApi.get('/stages', async c => c.json(await new AssetStore(c.env.CATALOG_DB!).stages()))
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
  return c.json(await new AssetStore(c.env.CATALOG_DB!).checkAccess(r.versionId))
})
assetApi.post('/classify', async c => c.json(await runClassification(await body(c.req.raw),c.env,c.req.header('CF-Connecting-IP')!)))
assetApi.get('/versions/:id/readiness', async c => {
  const id = versionId.parse(c.req.param('id')), store = new AssetStore(c.env.CATALOG_DB!), row = await store.version(id)
  if (!row) return c.json({ error: 'Not found.' },404)
  return c.json({ versionId: id, analysis: mediaReadiness(row), access: await store.access(id), jobs: await store.analysisJobs(id), liveEnabled: c.env.ASSET_AI_ENABLED === 'true' })
})
assetApi.post('/retrieve', async c => c.json(await new D1AssetRetriever(c.env.CATALOG_DB!).retrieve(await body(c.req.raw))))
assetApi.post('/reviews/identity', async c => { await new AssetStore(c.env.CATALOG_DB!).reviewIdentity(await body(c.req.raw)); return c.json({ reviewed: true }) })
assetApi.post('/reviews/reader', async c => { await new AssetStore(c.env.CATALOG_DB!).reviewReader(await body(c.req.raw)); return c.json({ reviewed: true }) })
