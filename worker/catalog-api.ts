import { Hono } from 'hono'
import { timingSafeEqual } from 'hono/utils/buffer'
import { z } from 'zod'
import { boundedText } from './meta'
import { queryRequest } from './catalog-contracts'
import { CatalogConflict, D1Catalog } from './catalog-store'
import { assetApi } from './asset-api'

export type CatalogBindings = { CATALOG_DB?: D1Database; CATALOG_OPERATOR_ENABLED?: string; CATALOG_OPERATOR_TOKEN?: string; PUBLIC_APP_ORIGIN?: string; ASSET_AI_ENABLED?: string }
export const catalogApi = new Hono<{ Bindings: CatalogBindings }>()
catalogApi.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  const env = c.env ?? {}, token = env.CATALOG_OPERATOR_TOKEN, auth = c.req.header('Authorization') ?? ''
  if (env.CATALOG_OPERATOR_ENABLED !== 'true' || !env.CATALOG_DB || !token || token.length < 32 || !env.PUBLIC_APP_ORIGIN) return c.json({ status: 'catalog_unavailable' }, 503)
  if (auth.length > 512 || !await timingSafeEqual(auth, `Bearer ${token}`) || c.req.header('Origin') !== env.PUBLIC_APP_ORIGIN || !c.req.header('CF-Connecting-IP') || c.req.header('CF-Connecting-IP')!.length > 64) return c.json({ error: 'Operator access required.' }, 403)
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
