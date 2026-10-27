import { Hono } from 'hono'
import { magazineRequest, catalog } from '../shared/magazine'
import { boundedText, generateMagazine, GenerationError } from './meta'
export { InferenceBudget } from './budget'

export type Bindings = {
  META_API_KEY?: string
  META_SPARK_MODEL?: string
  MAGAZINE_AI_ENABLED?: string
  MAGAZINE_MAX_CALLS?: string
  PUBLIC_APP_ORIGIN?: string
  RATE_LIMIT_SALT?: string
  INFERENCE_BUDGET?: DurableObjectNamespace
  ASSETS?: Fetcher
}
const app = new Hono<{ Bindings: Bindings }>()
app.use('/api/*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next() })
const configured = (env: Bindings) => Boolean(env.META_API_KEY && env.META_SPARK_MODEL === 'muse-spark-1.3' && env.INFERENCE_BUDGET && env.RATE_LIMIT_SALT && env.RATE_LIMIT_SALT.length >= 32 && env.PUBLIC_APP_ORIGIN)
app.get('/api/health', c => c.json({ ok: true, app: 'curio', metaConfigured: Boolean(c.env?.META_API_KEY && c.env?.META_SPARK_MODEL) }))
app.get('/api/magazine/config', c => c.json({ enabled: c.env?.MAGAZINE_AI_ENABLED === 'true' && configured(c.env), catalogSize: catalog.length }))
app.post('/api/magazine', async c => {
  let body: unknown
  try { body = JSON.parse(await boundedText(c.req.raw.body, 4096)) }
  catch (error) { return c.json({ error: error instanceof SyntaxError ? 'Invalid JSON.' : 'Request exceeds the 4 KiB limit.' }, error instanceof SyntaxError ? 400 : 413) }
  const parsed = magazineRequest.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid magazine preferences or missing consent.' }, 400)
  const env = c.env ?? {}
  if (env.MAGAZINE_AI_ENABLED !== 'true') return c.json({ status: 'disabled', message: 'Magazine generation is disabled. No preferences were sent to Meta.' }, 503)
  if (!configured(env)) return c.json({ status: 'not_configured', message: 'Generation is unavailable until the operator configures Meta and abuse protection.' }, 503)
  if (c.req.header('Origin') !== env.PUBLIC_APP_ORIGIN || !c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) return c.json({ error: 'Request origin or content type is not allowed.' }, 403)
  // Trust only Cloudflare's edge-set header, never client-provided X-Forwarded-For.
  const ip = c.req.header('CF-Connecting-IP')
  if (!ip || ip.length > 64) return c.json({ error: 'Trusted client address is unavailable.' }, 403)
  if (!catalog.length) return c.json({ status: 'empty_catalog', message: 'No fictional catalog items are available.' }, 503)
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.RATE_LIMIT_SALT!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip))
    const hash = Array.from(new Uint8Array(signature), x => x.toString(16).padStart(2, '0')).join('')
    const ceiling = Number(env.MAGAZINE_MAX_CALLS ?? '20')
    if (!Number.isInteger(ceiling) || ceiling < 1 || ceiling > 100) throw new Error('Invalid ceiling')
    const stub = env.INFERENCE_BUDGET!.get(env.INFERENCE_BUDGET!.idFromName('magazine-v1'))
    const response = await stub.fetch('https://budget/reserve', { method: 'POST', body: JSON.stringify({ ip: hash, ceiling }) })
    if (!response.ok) throw new Error('Budget unavailable')
    const result = await response.json() as { allowed?: boolean; retryAfter?: number }
    if (result.allowed === false) {
      c.header('Retry-After', String(result.retryAfter || 60))
      return c.json({ status: 'throttled', message: 'The generation safety limit has been reached. Please try later or contact the operator.' }, 429)
    }
    if (result.allowed !== true) throw new Error('Invalid budget result')
  } catch { return c.json({ status: 'protection_unavailable', message: 'Generation is blocked because its safety budget could not be checked.' }, 503) }
  const started = Date.now()
  const observe = (outcome: string) => console.info(JSON.stringify({ event: 'magazine_generation', outcome, durationMs: Date.now() - started }))
  try {
    const issue = await generateMagazine(parsed.data, env.META_API_KEY!, env.META_SPARK_MODEL!)
    observe('success')
    return c.json(issue)
  } catch (error) {
    observe(error instanceof GenerationError ? error.code : 'generation_error')
    if (error instanceof GenerationError) return c.json({ status: error.code, message: error.message }, error.status)
    return c.json({ status: 'generation_error', message: 'Generation could not be completed.' }, 502)
  }
})
app.notFound(c => c.json({ error: 'Not found' }, 404))
export default app
