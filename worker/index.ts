import { CatalogPublications } from './catalog-publications'
import { Hono } from 'hono'
import { timingSafeEqual } from 'hono/utils/buffer'
import { reserveInference } from './inference-budget'
import { decoderRequest } from '../shared/decoder'
import { runDecoder, DecoderError, decoderAvailable } from './decoder'
import {SamObjectStore} from './sam-object-store'
import { magazineRequest } from '../shared/magazine'
import { curationCatalog as catalog } from '../shared/catalog'
import { boundedText, generateMagazine, GenerationError } from './meta'
import { editorialApi } from './editorial'
import { issueDemoSession,clearDemoSession } from './demo-access'
import { catalogApi, type CatalogBindings } from './catalog-api'
import { mediaApi, mediaOperatorAuth, mediaRoot, publicMedia } from './media-api'
export { InferenceBudget } from './budget'

export type Bindings = CatalogBindings & {
  CATALOG_PUBLIC_ENABLED?: string
  SAM_OPERATOR_TOKEN?: string
  SAM_DECODER_ENABLED?: string
  META_SAM_MODEL?: string
  SAM_LIVE_ASSET_ID?: string
  DECODER_COMMENTARY_ENABLED?: string
  META_API_KEY?: string
  META_SPARK_MODEL?: string
  META_WONDER_MODEL?: string
  EDITORIAL_HYBRID_ENABLED?: string
  EDITORIAL_WONDER_PROVIDER_VERIFIED?: string
  MAGAZINE_AI_ENABLED?: string
  LEGACY_MAGAZINE_AI_ENABLED?: string
  EDITORIAL_REVIEW_ENABLED?: string
  EDITORIAL_PUBLIC_AI_ENABLED?: string
  EDITORIAL_DEMO_BUDGET_ENABLED?: string
  EDITORIAL_DEMO_DAILY_UNITS?: string
  EDITORIAL_DEMO_LIFETIME_UNITS?: string
  DEMO_TESTING_MODE?: string
  DEMO_TESTING_WINDOW_SECONDS?: string
  DEMO_TESTING_WINDOW_UNITS?: string
  EDITORIAL_TESTER_TOKEN_HASHES?: string
  EDITORIAL_DYNAMIC_CATALOG_ENABLED?: string
  EDITORIAL_ARTICLES_ENABLED?: string
  EDITORIAL_ARTICLE_PREPARATION_ENABLED?: string
  ARTICLE_CHIEF_TIMEOUT_MS?: string
  ARTICLE_PREP_MAX_PER_HOUR?: string
  ARTICLE_PREP_MAX_PER_DAY?: string
  ARTICLE_PREP_WINDOW_LIMIT?: string
  ARTICLE_PREP_WINDOW_SECONDS?: string
  ARTICLE_PREP_CONCURRENCY?: string
  EDITORIAL_KNOWLEDGE_V2_ENABLED?: string
  CULTURAL_INTELLIGENCE_V3_ENABLED?: string
  CULTURAL_RESEARCH_PLANNER_ENABLED?: string
  CULTURAL_RELATIONSHIP_AI_ENABLED?: string
  CULTURAL_LONGFORM_ENABLED?: string
  RESEARCH_SOURCE_ORIGINS?: string
  EDITORIAL_REVIEW_PILOT_TOKEN?: string
  MAGAZINE_MAX_CALLS?: string
  INFERENCE_DAILY_MAX_UNITS?: string
  INFERENCE_STANDARD_HOURLY_UNITS?: string
  INFERENCE_REVIEWED_HOURLY_UNITS?: string
  INFERENCE_PILOT_HOURLY_UNITS?: string
  INFERENCE_TESTER_HOURLY_UNITS?: string
  INFERENCE_TESTER_DAILY_UNITS?: string
  INFERENCE_COOLDOWN_SECONDS?: string
  INFERENCE_TESTER_CONCURRENT?: string
  EDITORIAL_PILOT_VERSION_IDS?: string
  PUBLIC_APP_ORIGIN?: string
  RATE_LIMIT_SALT?: string
  INFERENCE_BUDGET?: DurableObjectNamespace
  ASSETS?: Fetcher
  MEDIA_BUCKET?: R2Bucket
}
const app = new Hono<{ Bindings: Bindings }>()
app.use('/api/*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next() })
app.route('/api/operator/catalog', catalogApi)
app.get('/api/operator/media/',mediaOperatorAuth,mediaRoot)
app.route('/api/operator/media', mediaApi)
app.post('/api/editorial/demo-session',c=>issueDemoSession(c.req.raw,c.env))
app.delete('/api/editorial/demo-session',c=>clearDemoSession(c.req.raw,c.env))
app.route('/api/editorial', editorialApi)
app.get('/api/media/:version', c => publicMedia(c.req.raw,c.env,c.req.param('version')))
app.get('/api/catalog/published',async c=>{
  if(c.env?.CATALOG_PUBLIC_ENABLED !== 'true' || !c.env.CATALOG_DB)return c.json({status:'catalog_unavailable'},503)
  c.header('Cache-Control','no-store')
  const cursor=c.req.query('cursor')??'',ids=c.req.query('ids')?.split(',')??null
  if(cursor.length>80||ids&&(ids.length>60||ids.some(id=>!/^version-[a-f0-9]{64}$/.test(id))))return c.json({error:'Invalid catalog query.'},400)
  try{return c.json(await new CatalogPublications(c.env.CATALOG_DB!).list(cursor,ids?60:50,ids))}catch{return c.json({items:[],nextCursor:null})}
})
app.get('/api/catalog/object-regions/:version',async c=>{
  if(c.env?.CATALOG_PUBLIC_ENABLED!=='true'||!c.env.CATALOG_DB)return c.json({status:'catalog_unavailable'},503)
  const versionId=c.req.param('version')
  if(!/^version-[a-f0-9]{64}$/.test(versionId))return c.json({error:'Invalid asset version.'},400)
  try{const published=await new SamObjectStore(c.env.CATALOG_DB).published(versionId);return published?c.json(published):c.json({error:'Object regions unavailable.'},404)}catch{return c.json({error:'Object regions unavailable.'},503)}
})
const configured = (env: Bindings) => Boolean(env.META_API_KEY && env.META_SPARK_MODEL === 'muse-spark-1.3' && env.INFERENCE_BUDGET && env.RATE_LIMIT_SALT && env.RATE_LIMIT_SALT.length >= 32 && env.PUBLIC_APP_ORIGIN)
app.get('/api/health', c => c.json({ ok: true, app: 'curio', metaConfigured: Boolean(c.env?.META_API_KEY && c.env?.META_SPARK_MODEL) }))
app.get('/api/magazine/config', c => c.json({ enabled: c.env?.LEGACY_MAGAZINE_AI_ENABLED === 'true' && configured(c.env), catalogSize: catalog.length }))
app.post('/api/magazine', async c => {
  let body: unknown
  try { body = JSON.parse(await boundedText(c.req.raw.body, 4096)) }
  catch (error) { return c.json({ error: error instanceof SyntaxError ? 'Invalid JSON.' : 'Request exceeds the 4 KiB limit.' }, error instanceof SyntaxError ? 400 : 413) }
  const parsed = magazineRequest.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid magazine preferences or missing consent.' }, 400)
  const env = c.env ?? {}
  if (env.LEGACY_MAGAZINE_AI_ENABLED !== 'true') return c.json({ status: 'disabled', message: 'Magazine generation is disabled. No preferences were sent to Meta.' }, 503)
  if (!configured(env)) return c.json({ status: 'not_configured', message: 'Generation is unavailable until the operator configures Meta and abuse protection.' }, 503)
  if (c.req.header('Origin') !== env.PUBLIC_APP_ORIGIN || !c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) return c.json({ error: 'Request origin or content type is not allowed.' }, 403)
  // Trust only Cloudflare's edge-set header, never client-provided X-Forwarded-For.
  const ip = c.req.header('CF-Connecting-IP')
  if (!ip || ip.length > 64) return c.json({ error: 'Trusted client address is unavailable.' }, 403)
  if (!catalog.length) return c.json({ status: 'empty_catalog', message: 'No fictional catalog items are available.' }, 503)
  try {
    const result = await reserveInference(env, ip)
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
app.get('/api/decoder/config', c => c.json({ enabled: decoderAvailable(c.env ?? {}), demo: 'authored_regions_not_sam' }))
app.post('/api/decoder', async c => {
  let body: unknown
  try { body = JSON.parse(await boundedText(c.req.raw.body, 1024)) }
  catch (error) { return c.json({ error: error instanceof SyntaxError ? 'Invalid JSON.' : 'Decoder input exceeds 1 KiB.' }, error instanceof SyntaxError ? 400 : 413) }
  const parsed = decoderRequest.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid Decoder selection or missing consent.' }, 400)
  const env = c.env ?? {}
  if (env.SAM_DECODER_ENABLED !== 'true') return c.json({ status: 'disabled', message: 'Live SAM analysis is disabled. Authored demos do not call a model.' }, 503)
  if (!env.SAM_OPERATOR_TOKEN || env.SAM_OPERATOR_TOKEN.length < 32) return c.json({ status: 'operator_not_configured', message: 'A private operator test credential is required.' }, 503)
  const authorization = c.req.header('Authorization') ?? ''
  if (authorization.length > 512 || !await timingSafeEqual(authorization, `Bearer ${env.SAM_OPERATOR_TOKEN}`)) return c.json({ status: 'operator_required', message: 'Live Decoder analysis is restricted to the authorized operator.' }, 403)
  if (c.req.header('Origin') !== env.PUBLIC_APP_ORIGIN || !c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) return c.json({ error: 'Request origin or content type is not allowed.' }, 403)
  const ip = c.req.header('CF-Connecting-IP')
  if (!ip || ip.length > 64) return c.json({ error: 'Trusted client address is unavailable.' }, 403)
  try { return c.json(await runDecoder(parsed.data, env, ip)) }
  catch (error) {
    if (error instanceof DecoderError) {
      if (error.retryAfter) c.header('Retry-After', String(error.retryAfter))
      return c.json({ status: error.code, message: error.message }, error.status)
    }
    return c.json({ status: 'decoder_unavailable', message: 'The Decoder could not complete this request.' }, 503)
  }
})
app.notFound(c => c.json({ error: 'Not found' }, 404))
export default app
